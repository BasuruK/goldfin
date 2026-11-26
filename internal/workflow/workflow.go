// Package workflow validates saved Workflow graphs before persistence.
package workflow

import (
	"errors"
	"strings"
	"unicode/utf8"
)

// ErrInvalid marks a structurally invalid Workflow or node wiring.
var ErrInvalid = errors.New("invalid workflow")

// Node is one Connector (and Prompt for an LLM node) in a Workflow graph.
type Node struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	ConnectorID  string   `json:"connectorId"`
	ModelID      string   `json:"modelId,omitempty"`
	PromptID     string   `json:"promptId,omitempty"`
	InputNodeIDs []string `json:"inputNodeIds"`
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
	return validate(g, catalog)
}

// Validate checks the graph and returns a deterministic topological order of node ids.
func Validate(g Graph, catalog Catalog) ([]string, error) {
	return validate(g, catalog)
}

func validate(g Graph, catalog Catalog) ([]string, error) {
	name := strings.TrimSpace(g.Name)
	if name == "" || utf8.RuneCountInString(name) > maxNameRunes || strings.ContainsRune(name, 0) {
		return nil, ErrInvalid
	}
	if len(g.Nodes) == 0 {
		return nil, ErrInvalid
	}
	byID := make(map[string]int, len(g.Nodes))
	byName := make(map[string]struct{}, len(g.Nodes))
	for i, node := range g.Nodes {
		id := strings.TrimSpace(node.ID)
		nodeName := strings.TrimSpace(node.Name)
		connectorID := strings.TrimSpace(node.ConnectorID)
		if id == "" || nodeName == "" || connectorID == "" {
			return nil, ErrInvalid
		}
		if _, ok := byID[id]; ok {
			return nil, ErrInvalid
		}
		if _, ok := byName[nodeName]; ok {
			return nil, ErrInvalid
		}
		byID[id] = i
		byName[nodeName] = struct{}{}
	}
	inDegree := make([]int, len(g.Nodes))
	edges := make([][]int, len(g.Nodes))
	for i, node := range g.Nodes {
		id := strings.TrimSpace(node.ID)
		info, err := catalog.Connector(strings.TrimSpace(node.ConnectorID))
		if err != nil {
			return nil, ErrInvalid
		}
		role := connectorRole(info.ProviderType)
		if role == roleUnknown {
			return nil, ErrInvalid
		}
		promptID := strings.TrimSpace(node.PromptID)
		modelID := strings.TrimSpace(node.ModelID)
		if err := validateConnectorFields(role, info.ProviderType, modelID, promptID, node.ConnectorID, catalog); err != nil {
			return nil, err
		}
		if err := validateInputs(role, id, node.InputNodeIDs, byID, &inDegree, &edges, i); err != nil {
			return nil, err
		}
		_ = id
	}
	order, err := topologicalOrder(inDegree, edges)
	if err != nil {
		return nil, err
	}
	out := make([]string, len(order))
	for i, idx := range order {
		out[i] = strings.TrimSpace(g.Nodes[idx].ID)
	}
	return out, nil
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
			if err != nil || !enabled {
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
		if err != nil || !exists {
			return ErrInvalid
		}
		if !hasModels || modelID == "" {
			return ErrInvalid
		}
		enabled, err := catalog.ModelEnabled(connectorID, modelID)
		if err != nil || !enabled {
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
	for _, raw := range inputs {
		fromID := strings.TrimSpace(raw)
		if fromID == "" {
			return ErrInvalid
		}
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
	var queue []int
	for i, d := range deg {
		if d == 0 {
			queue = append(queue, i)
		}
	}
	order := make([]int, 0, n)
	for len(queue) > 0 {
		i := queue[0]
		queue = queue[1:]
		order = append(order, i)
		for _, to := range edges[i] {
			deg[to]--
			if deg[to] == 0 {
				queue = append(queue, to)
			}
		}
	}
	if len(order) != n {
		return nil, ErrInvalid
	}
	return order, nil
}
