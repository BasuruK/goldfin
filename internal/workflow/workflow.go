// Package workflow validates saved Workflow graphs before persistence.
package workflow

import (
	"encoding/json"
	"errors"
	"strings"
	"unicode/utf8"
)

// ErrInvalid marks a structurally invalid Workflow or node wiring.
var ErrInvalid = errors.New("invalid workflow")

// ErrMissingReference marks a Connector or Prompt id that does not exist.
var ErrMissingReference = errors.New("missing workflow reference")

// Node is one Connector (and Prompt for an LLM node) in a Workflow graph.
type Node struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	ConnectorID  string   `json:"connectorId"`
	ModelID      string   `json:"modelId,omitempty"`
	PromptID     string   `json:"promptId,omitempty"`
	InputNodeIDs []string `json:"inputNodeIds"`
}

// MarshalJSON always emits inputNodeIds as a JSON array, never null.
func (n Node) MarshalJSON() ([]byte, error) {
	type nodeAlias Node
	copy := nodeAlias(n)
	if copy.InputNodeIDs == nil {
		copy.InputNodeIDs = []string{}
	}
	return json.Marshal(copy)
}

// Graph is the mutable graph fields of a Workflow.
type Graph struct {
	Name  string
	Nodes []Node
}

const maxNameRunes = 80

// ConnectorInfo is the provider kind a persisted Connector needs for node rules.
type ConnectorInfo struct {
	ProviderType string
}

// Catalog answers existence and provider-type questions for referenced ids.
type Catalog interface {
	Connector(id string) (ConnectorInfo, error)
	ModelEnabled(connectorID, modelID string) (bool, error)
	PromptExists(id string) (bool, error)
}

// TopologicalOrder validates g and returns node ids in deterministic execution order.
func TopologicalOrder(g Graph, catalog Catalog) ([]string, error) {
	_, order, err := validate(g, catalog)
	return order, err
}

// Validate checks the graph, returns a normalized graph, and a deterministic topological order of node ids.
func Validate(g Graph, catalog Catalog) (Graph, []string, error) {
	return validate(g, catalog)
}

func validate(g Graph, catalog Catalog) (Graph, []string, error) {
	if strings.ContainsRune(g.Name, 0) {
		return Graph{}, nil, ErrInvalid
	}
	name := strings.TrimSpace(g.Name)
	if err := rejectText(name, maxNameRunes); err != nil {
		return Graph{}, nil, err
	}
	if len(g.Nodes) == 0 {
		return Graph{}, nil, ErrInvalid
	}
	byID := make(map[string]int, len(g.Nodes))
	byName := make(map[string]struct{}, len(g.Nodes))
	normalized := make([]Node, len(g.Nodes))
	for i, node := range g.Nodes {
		id, nodeName, connectorID, modelID, promptID, inputs, err := normalizeNode(node)
		if err != nil {
			return Graph{}, nil, err
		}
		if id == "" || nodeName == "" || connectorID == "" {
			return Graph{}, nil, ErrInvalid
		}
		if _, ok := byID[id]; ok {
			return Graph{}, nil, ErrInvalid
		}
		if _, ok := byName[nodeName]; ok {
			return Graph{}, nil, ErrInvalid
		}
		byID[id] = i
		byName[nodeName] = struct{}{}
		normalized[i] = Node{
			ID: id, Name: nodeName, ConnectorID: connectorID,
			ModelID: modelID, PromptID: promptID, InputNodeIDs: inputs,
		}
	}
	inDegree := make([]int, len(normalized))
	edges := make([][]int, len(normalized))
	for i, node := range normalized {
		info, err := catalog.Connector(node.ConnectorID)
		if errors.Is(err, ErrMissingReference) {
			return Graph{}, nil, ErrInvalid
		}
		if err != nil {
			return Graph{}, nil, err
		}
		role := connectorRole(info.ProviderType)
		if role == roleUnknown {
			return Graph{}, nil, ErrInvalid
		}
		if err := validateConnectorFields(role, info.ProviderType, node.ModelID, node.PromptID, node.ConnectorID, catalog); err != nil {
			return Graph{}, nil, err
		}
		if err := validateInputs(role, node.ID, node.InputNodeIDs, byID, &inDegree, &edges, i); err != nil {
			return Graph{}, nil, err
		}
	}
	order, err := topologicalOrder(inDegree, edges)
	if err != nil {
		return Graph{}, nil, err
	}
	out := make([]string, len(order))
	for i, idx := range order {
		out[i] = normalized[idx].ID
	}
	return Graph{Name: name, Nodes: normalized}, out, nil
}

func normalizeNode(node Node) (id, name, connectorID, modelID, promptID string, inputs []string, err error) {
	for _, raw := range []string{node.ID, node.Name, node.ConnectorID, node.ModelID, node.PromptID} {
		if strings.ContainsRune(raw, 0) {
			return "", "", "", "", "", nil, ErrInvalid
		}
	}
	id = strings.TrimSpace(node.ID)
	name = strings.TrimSpace(node.Name)
	connectorID = strings.TrimSpace(node.ConnectorID)
	modelID = strings.TrimSpace(node.ModelID)
	promptID = strings.TrimSpace(node.PromptID)
	if node.InputNodeIDs == nil {
		inputs = []string{}
	} else {
		inputs = make([]string, 0, len(node.InputNodeIDs))
		for _, raw := range node.InputNodeIDs {
			if strings.ContainsRune(raw, 0) {
				return "", "", "", "", "", nil, ErrInvalid
			}
			trimmed := strings.TrimSpace(raw)
			if trimmed == "" {
				return "", "", "", "", "", nil, ErrInvalid
			}
			inputs = append(inputs, trimmed)
		}
	}
	return id, name, connectorID, modelID, promptID, inputs, nil
}

func rejectText(text string, maxRunes int) error {
	if text == "" || utf8.RuneCountInString(text) > maxRunes || strings.ContainsRune(text, 0) {
		return ErrInvalid
	}
	return nil
}

type nodeRole int

const (
	roleUnknown nodeRole = iota
	roleDocument
	roleLLM
)

func connectorRole(providerType string) nodeRole {
	switch providerType {
	case "azure_document_intelligence", "azure_foundry", "web_request":
		return roleDocument
	case "openai", "openai_compatible":
		return roleLLM
	default:
		return roleUnknown
	}
}

func connectorHasModels(providerType string) bool {
	switch providerType {
	case "openai", "openai_compatible", "azure_foundry":
		return true
	default:
		return false
	}
}

func validateConnectorFields(role nodeRole, providerType, modelID, promptID, connectorID string, catalog Catalog) error {
	hasModels := connectorHasModels(providerType)
	switch role {
	case roleDocument:
		if promptID != "" {
			return ErrInvalid
		}
		if hasModels {
			if modelID == "" {
				return ErrInvalid
			}
			enabled, err := catalog.ModelEnabled(connectorID, modelID)
			if err != nil {
				return err
			}
			if !enabled {
				return ErrInvalid
			}
		} else if modelID != "" {
			return ErrInvalid
		}
	case roleLLM:
		if promptID == "" {
			return ErrInvalid
		}
		exists, err := catalog.PromptExists(promptID)
		if err != nil {
			return err
		}
		if !exists {
			return ErrInvalid
		}
		if !hasModels || modelID == "" {
			return ErrInvalid
		}
		enabled, err := catalog.ModelEnabled(connectorID, modelID)
		if err != nil {
			return err
		}
		if !enabled {
			return ErrInvalid
		}
	default:
		return ErrInvalid
	}
	return nil
}

func validateInputs(role nodeRole, selfID string, inputs []string, byID map[string]int, inDegree *[]int, edges *[][]int, target int) error {
	switch role {
	case roleDocument:
		if len(inputs) != 0 {
			return ErrInvalid
		}
	case roleLLM:
		if len(inputs) == 0 {
			return ErrInvalid
		}
	}
	seen := make(map[string]struct{}, len(inputs))
	for _, fromID := range inputs {
		if fromID == selfID {
			return ErrInvalid
		}
		if _, dup := seen[fromID]; dup {
			return ErrInvalid
		}
		seen[fromID] = struct{}{}
		fromIdx, ok := byID[fromID]
		if !ok {
			return ErrInvalid
		}
		(*inDegree)[target]++
		(*edges)[fromIdx] = append((*edges)[fromIdx], target)
	}
	return nil
}

func topologicalOrder(inDegree []int, edges [][]int) ([]int, error) {
	n := len(inDegree)
	deg := append([]int(nil), inDegree...)
	ready := make([]int, 0, n)
	for i, d := range deg {
		if d == 0 {
			ready = append(ready, i)
		}
	}
	order := make([]int, 0, n)
	for len(order) < n {
		if len(ready) == 0 {
			return nil, ErrInvalid
		}
		bestPos := 0
		for j := 1; j < len(ready); j++ {
			if ready[j] < ready[bestPos] {
				bestPos = j
			}
		}
		i := ready[bestPos]
		ready = append(ready[:bestPos], ready[bestPos+1:]...)
		order = append(order, i)
		for _, to := range edges[i] {
			deg[to]--
			if deg[to] == 0 {
				ready = append(ready, to)
			}
		}
	}
	return order, nil
}
