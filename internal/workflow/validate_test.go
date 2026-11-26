package workflow_test

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/BasuruK/goldfin/internal/workflow"
)

type stubCatalog struct {
	connectors map[string]workflow.ConnectorInfo
	models     map[[2]string]bool
	prompts    map[string]bool
	dbErr      bool
}

func (s stubCatalog) Connector(id string) (workflow.ConnectorInfo, error) {
	if s.dbErr {
		return workflow.ConnectorInfo{}, errors.New("db unavailable")
	}
	info, ok := s.connectors[id]
	if !ok {
		return workflow.ConnectorInfo{}, workflow.ErrMissingReference
	}
	return info, nil
}

func (s stubCatalog) ModelEnabled(connectorID, modelID string) (bool, error) {
	if s.dbErr {
		return false, errors.New("db unavailable")
	}
	enabled, ok := s.models[[2]string{connectorID, modelID}]
	if !ok {
		return false, nil
	}
	return enabled, nil
}

func (s stubCatalog) PromptExists(id string) (bool, error) {
	if s.dbErr {
		return false, errors.New("db unavailable")
	}
	return s.prompts[id], nil
}

func baseCatalog() stubCatalog {
	return stubCatalog{
		connectors: map[string]workflow.ConnectorInfo{
			"ocr":     {ProviderType: "azure_document_intelligence"},
			"foundry": {ProviderType: "azure_foundry"},
			"llm":     {ProviderType: "openai"},
			"rest":    {ProviderType: "web_request"},
		},
		models: map[[2]string]bool{
			{"llm", "gpt-4o"}:      true,
			{"foundry", "mistral"}: true,
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
	_, order, err := workflow.Validate(g, cat)
	if err != nil || len(order) != 2 || order[0] != "a" || order[1] != "b" {
		t.Fatalf("order=%v err=%v", order, err)
	}
	g.Nodes = append(g.Nodes, workflow.Node{
		ID: "c", Name: "Other OCR", ConnectorID: "ocr", InputNodeIDs: nil,
	})
	_, order, err = workflow.Validate(g, cat)
	want := "a,b,c"
	if err != nil || strings.Join(order, ",") != want {
		t.Fatalf("want %s got %v err=%v", want, order, err)
	}
}

func TestTopologicalDeclarationOrderBeatsDiscovery(t *testing.T) {
	cat := baseCatalog()
	g := workflow.Graph{
		Name: "Tie break",
		Nodes: []workflow.Node{
			{ID: "a", Name: "Root", ConnectorID: "ocr"},
			{ID: "c", Name: "Mid", ConnectorID: "llm", ModelID: "gpt-4o", PromptID: "p1", InputNodeIDs: []string{"a"}},
			{ID: "b", Name: "Other root", ConnectorID: "ocr"},
		},
	}
	_, order, err := workflow.Validate(g, cat)
	if err != nil || strings.Join(order, ",") != "a,c,b" {
		t.Fatalf("order=%v err=%v", order, err)
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
	if _, _, err := workflow.Validate(g, cat); !errors.Is(err, workflow.ErrInvalid) {
		t.Fatalf("cycle: %v", err)
	}
}

func TestValidateRejectsCycleWithValidRoot(t *testing.T) {
	cat := baseCatalog()
	g := workflow.Graph{
		Name: "Root plus cycle",
		Nodes: []workflow.Node{
			{ID: "root", Name: "OCR", ConnectorID: "ocr"},
			{ID: "b", Name: "B", ConnectorID: "llm", ModelID: "gpt-4o", PromptID: "p1", InputNodeIDs: []string{"c"}},
			{ID: "c", Name: "C", ConnectorID: "llm", ModelID: "gpt-4o", PromptID: "p1", InputNodeIDs: []string{"b"}},
		},
	}
	if _, _, err := workflow.Validate(g, cat); !errors.Is(err, workflow.ErrInvalid) {
		t.Fatalf("cycle with root: %v", err)
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
	if _, _, err := workflow.Validate(g, cat); !errors.Is(err, workflow.ErrInvalid) {
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
			if _, _, err := workflow.Validate(workflow.Graph{Name: "W", Nodes: nodes}, cat); !errors.Is(err, workflow.ErrInvalid) {
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
		if _, _, err := workflow.Validate(g, cat); !errors.Is(err, workflow.ErrInvalid) {
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
	if _, _, err := workflow.Validate(g, cat); !errors.Is(err, workflow.ErrInvalid) {
		t.Fatalf("%v", err)
	}
}

func TestValidateLLMRejectsMissingModelAndPrompt(t *testing.T) {
	cat := baseCatalog()
	for name, node := range map[string]workflow.Node{
		"no_model":       {ID: "a", Name: "LLM", ConnectorID: "llm", PromptID: "p1", InputNodeIDs: []string{"r"}},
		"no_prompt":      {ID: "a", Name: "LLM", ConnectorID: "llm", ModelID: "gpt-4o", InputNodeIDs: []string{"r"}},
		"disabled_model": {ID: "a", Name: "LLM", ConnectorID: "llm", ModelID: "off", PromptID: "p1", InputNodeIDs: []string{"r"}},
	} {
		t.Run(name, func(t *testing.T) {
			g := workflow.Graph{
				Name: "W",
				Nodes: []workflow.Node{
					{ID: "r", Name: "OCR", ConnectorID: "ocr"},
					node,
				},
			}
			if _, _, err := workflow.Validate(g, cat); !errors.Is(err, workflow.ErrInvalid) {
				t.Fatalf("%v", err)
			}
		})
	}
}

func TestValidateFoundryRequiresEnabledModel(t *testing.T) {
	cat := baseCatalog()
	t.Run("missing", func(t *testing.T) {
		g := workflow.Graph{
			Name:  "W",
			Nodes: []workflow.Node{{ID: "a", Name: "OCR", ConnectorID: "foundry"}},
		}
		if _, _, err := workflow.Validate(g, cat); !errors.Is(err, workflow.ErrInvalid) {
			t.Fatalf("%v", err)
		}
	})
	t.Run("disabled", func(t *testing.T) {
		g := workflow.Graph{
			Name:  "W",
			Nodes: []workflow.Node{{ID: "a", Name: "OCR", ConnectorID: "foundry", ModelID: "disabled"}},
		}
		if _, _, err := workflow.Validate(g, cat); !errors.Is(err, workflow.ErrInvalid) {
			t.Fatalf("%v", err)
		}
	})
	t.Run("ok", func(t *testing.T) {
		g := workflow.Graph{
			Name:  "W",
			Nodes: []workflow.Node{{ID: "a", Name: "OCR", ConnectorID: "foundry", ModelID: "mistral"}},
		}
		if _, _, err := workflow.Validate(g, cat); err != nil {
			t.Fatalf("%v", err)
		}
	})
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
	_, order, err := workflow.Validate(g, cat)
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
	normalized, order, err := workflow.Validate(g, cat)
	if err != nil || len(order) != 3 {
		t.Fatalf("order=%v err=%v", order, err)
	}
	if len(normalized.Nodes[2].InputNodeIDs) != 2 || normalized.Nodes[2].InputNodeIDs[0] != "a" {
		t.Fatalf("inputs: %+v", normalized.Nodes[2].InputNodeIDs)
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
	if _, _, err := workflow.Validate(g, cat); !errors.Is(err, workflow.ErrInvalid) {
		t.Fatalf("unknown: %v", err)
	}
	g.Nodes[1].InputNodeIDs = []string{"a", "a"}
	if _, _, err := workflow.Validate(g, cat); !errors.Is(err, workflow.ErrInvalid) {
		t.Fatalf("dup inputs: %v", err)
	}
}

func TestValidateNormalizesWhitespaceAndEmptyInputs(t *testing.T) {
	cat := baseCatalog()
	g := workflow.Graph{
		Name: "  Invoices  ",
		Nodes: []workflow.Node{
			{
				ID: " n1 ", Name: " OCR ", ConnectorID: " ocr ", InputNodeIDs: nil,
			},
			{
				ID: "n2", Name: "Extract", ConnectorID: " llm ",
				ModelID: " gpt-4o ", PromptID: " p1 ",
				InputNodeIDs: []string{" n1 "},
			},
		},
	}
	normalized, _, err := workflow.Validate(g, cat)
	if err != nil {
		t.Fatal(err)
	}
	if normalized.Name != "Invoices" {
		t.Fatalf("name=%q", normalized.Name)
	}
	n := normalized.Nodes[0]
	if n.ID != "n1" || n.ConnectorID != "ocr" || len(n.InputNodeIDs) != 0 {
		t.Fatalf("ocr node: %+v", n)
	}
	b, err := json.Marshal(n)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), "null") {
		t.Fatalf("inputNodeIds must not be null: %s", b)
	}
}

func TestValidateRejectsNULInTextFields(t *testing.T) {
	cat := baseCatalog()
	g := workflow.Graph{
		Name:  "Bad\u0000",
		Nodes: []workflow.Node{{ID: "a", Name: "OCR", ConnectorID: "ocr"}},
	}
	if _, _, err := workflow.Validate(g, cat); !errors.Is(err, workflow.ErrInvalid) {
		t.Fatalf("name nul: %v", err)
	}
}

func TestValidatePropagatesCatalogErrors(t *testing.T) {
	cat := baseCatalog()
	cat.dbErr = true
	if _, _, err := workflow.Validate(validLinearGraph(), cat); err == nil || errors.Is(err, workflow.ErrInvalid) {
		t.Fatalf("want catalog error, got %v", err)
	}
}

func TestExecutionOrderMatchesValidateWithoutCatalog(t *testing.T) {
	g := validLinearGraph()
	_, want, err := workflow.Validate(g, baseCatalog())
	if err != nil {
		t.Fatal(err)
	}
	got, err := workflow.ExecutionOrder(g)
	if err != nil || len(got) != len(want) {
		t.Fatalf("ExecutionOrder: %v err=%v", got, err)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("index %d: got %q want %q", i, got[i], want[i])
		}
	}
}

func TestExecutionOrderRejectsCycle(t *testing.T) {
	g := workflow.Graph{Name: "cycle", Nodes: []workflow.Node{
		{ID: "a", Name: "A", ConnectorID: "ocr", InputNodeIDs: []string{"b"}},
		{ID: "b", Name: "B", ConnectorID: "llm", ModelID: "m", PromptID: "p", InputNodeIDs: []string{"a"}},
	}}
	if _, err := workflow.ExecutionOrder(g); !errors.Is(err, workflow.ErrInvalid) {
		t.Fatalf("cycle: %v", err)
	}
}
