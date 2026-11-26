package workflow_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/BasuruK/goldfin/internal/workflow"
)

type stubCatalog struct {
	connectors map[string]workflow.ConnectorInfo
	models     map[[2]string]bool
	prompts    map[string]bool
}

func (s stubCatalog) Connector(id string) (workflow.ConnectorInfo, error) {
	info, ok := s.connectors[id]
	if !ok {
		return workflow.ConnectorInfo{}, errors.New("missing")
	}
	return info, nil
}

func (s stubCatalog) ModelEnabled(connectorID, modelID string) (bool, error) {
	enabled, ok := s.models[[2]string{connectorID, modelID}]
	if !ok {
		return false, nil
	}
	return enabled, nil
}

func (s stubCatalog) PromptExists(id string) (bool, error) {
	return s.prompts[id], nil
}

func baseCatalog() stubCatalog {
	return stubCatalog{
		connectors: map[string]workflow.ConnectorInfo{
			"ocr":  {ProviderType: "azure_document_intelligence"},
			"llm":  {ProviderType: "openai"},
			"rest": {ProviderType: "web_request"},
		},
		models: map[[2]string]bool{
			{"llm", "gpt-4o"}: true,
		},
		prompts: map[string]bool{"p1": true},
	}
}

func validLinearGraph() workflow.Graph {
	return workflow.Graph{
		Name: "Invoices",
		Nodes: []workflow.Node{
			{ID: "a", Name: "OCR", ConnectorID: "ocr", InputNodeIDs: nil},
			{ID: "b", Name: "Extract", ConnectorID: "llm", ModelID: "gpt-4o", PromptID: "p1", InputNodeIDs: []string{"a"}},
		},
	}
}

func TestValidateTopologicalOrderDeterministic(t *testing.T) {
	cat := baseCatalog()
	g := validLinearGraph()
	order, err := workflow.Validate(g, cat)
	if err != nil || len(order) != 2 || order[0] != "a" || order[1] != "b" {
		t.Fatalf("order=%v err=%v", order, err)
	}
	g.Nodes = append(g.Nodes, workflow.Node{
		ID: "c", Name: "Other OCR", ConnectorID: "ocr", InputNodeIDs: nil,
	})
	order, err = workflow.Validate(g, cat)
	want := "a,c,b"
	if err != nil || strings.Join(order, ",") != want {
		t.Fatalf("want %s got %v err=%v", want, order, err)
	}
}

func TestValidateRejectsCycle(t *testing.T) {
	cat := baseCatalog()
	g := workflow.Graph{
		Name: "Loop",
		Nodes: []workflow.Node{
			{ID: "a", Name: "A", ConnectorID: "llm", ModelID: "gpt-4o", PromptID: "p1", InputNodeIDs: []string{"b"}},
			{ID: "b", Name: "B", ConnectorID: "llm", ModelID: "gpt-4o", PromptID: "p1", InputNodeIDs: []string{"a"}},
		},
	}
	if _, err := workflow.Validate(g, cat); !errors.Is(err, workflow.ErrInvalid) {
		t.Fatalf("cycle: %v", err)
	}
}

func TestValidateRejectsSelfEdge(t *testing.T) {
	cat := baseCatalog()
	g := workflow.Graph{
		Name: "Self",
		Nodes: []workflow.Node{
			{ID: "a", Name: "A", ConnectorID: "llm", ModelID: "gpt-4o", PromptID: "p1", InputNodeIDs: []string{"a"}},
		},
	}
	if _, err := workflow.Validate(g, cat); !errors.Is(err, workflow.ErrInvalid) {
		t.Fatalf("self: %v", err)
	}
}

func TestValidateRejectsDuplicateIDsAndNames(t *testing.T) {
	cat := baseCatalog()
	for name, nodes := range map[string][]workflow.Node{
		"dup_id": {
			{ID: "a", Name: "One", ConnectorID: "ocr"},
			{ID: "a", Name: "Two", ConnectorID: "ocr"},
		},
		"dup_name": {
			{ID: "a", Name: "Same", ConnectorID: "ocr"},
			{ID: "b", Name: "Same", ConnectorID: "ocr"},
		},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := workflow.Validate(workflow.Graph{Name: "W", Nodes: nodes}, cat); !errors.Is(err, workflow.ErrInvalid) {
				t.Fatalf("%v", err)
			}
		})
	}
}

func TestValidateOCRAndRESTRequireNoInputs(t *testing.T) {
	cat := baseCatalog()
	for _, connectorID := range []string{"ocr", "rest"} {
		g := workflow.Graph{
			Name: "Bad",
			Nodes: []workflow.Node{
				{ID: "a", Name: "Root", ConnectorID: connectorID, InputNodeIDs: []string{"b"}},
				{ID: "b", Name: "Other", ConnectorID: "ocr"},
			},
		}
		if _, err := workflow.Validate(g, cat); !errors.Is(err, workflow.ErrInvalid) {
			t.Fatalf("%s inputs: %v", connectorID, err)
		}
	}
}

func TestValidateLLMRequiresInputs(t *testing.T) {
	cat := baseCatalog()
	g := workflow.Graph{
		Name: "Lonely LLM",
		Nodes: []workflow.Node{
			{ID: "a", Name: "LLM", ConnectorID: "llm", ModelID: "gpt-4o", PromptID: "p1", InputNodeIDs: nil},
		},
	}
	if _, err := workflow.Validate(g, cat); !errors.Is(err, workflow.ErrInvalid) {
		t.Fatalf("%v", err)
	}
}

func TestValidateMultipleRootOCRAllowed(t *testing.T) {
	cat := baseCatalog()
	g := workflow.Graph{
		Name: "Two OCR",
		Nodes: []workflow.Node{
			{ID: "a", Name: "OCR1", ConnectorID: "ocr"},
			{ID: "b", Name: "OCR2", ConnectorID: "ocr"},
		},
	}
	order, err := workflow.Validate(g, cat)
	if err != nil || len(order) != 2 {
		t.Fatalf("order=%v err=%v", order, err)
	}
}

func TestValidateFanInPreservesInputOrder(t *testing.T) {
	cat := baseCatalog()
	g := workflow.Graph{
		Name: "Fan in",
		Nodes: []workflow.Node{
			{ID: "a", Name: "OCR1", ConnectorID: "ocr"},
			{ID: "b", Name: "OCR2", ConnectorID: "ocr"},
			{ID: "c", Name: "Merge", ConnectorID: "llm", ModelID: "gpt-4o", PromptID: "p1",
				InputNodeIDs: []string{"a", "b"}},
		},
	}
	if len(g.Nodes[2].InputNodeIDs) != 2 || g.Nodes[2].InputNodeIDs[0] != "a" {
		t.Fatal("fixture inputs")
	}
	order, err := workflow.Validate(g, cat)
	if err != nil || len(order) != 3 {
		t.Fatalf("order=%v err=%v", order, err)
	}
}

func TestValidateRejectsUnknownInputAndDuplicateInputs(t *testing.T) {
	cat := baseCatalog()
	g := workflow.Graph{
		Name: "Bad wire",
		Nodes: []workflow.Node{
			{ID: "a", Name: "OCR", ConnectorID: "ocr"},
			{ID: "b", Name: "LLM", ConnectorID: "llm", ModelID: "gpt-4o", PromptID: "p1", InputNodeIDs: []string{"missing"}},
		},
	}
	if _, err := workflow.Validate(g, cat); !errors.Is(err, workflow.ErrInvalid) {
		t.Fatalf("unknown: %v", err)
	}
	g.Nodes[1].InputNodeIDs = []string{"a", "a"}
	if _, err := workflow.Validate(g, cat); !errors.Is(err, workflow.ErrInvalid) {
		t.Fatalf("dup inputs: %v", err)
	}
}
