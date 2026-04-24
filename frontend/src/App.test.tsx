import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import App from "./App";

function mockJsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

describe("App smoke", () => {
  it("renders today page with backend data", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/today")) {
        return mockJsonResponse({
          metrics: { blocks: 0, subjects: 0, due_reviews: 0, forgotten_subjects: 0 },
          priority: {
            title: "Base pronta para comecar",
            description: "Registre questoes e revisoes para gerar prioridades mais inteligentes.",
          },
          due_reviews: [],
          risk_blocks: [],
          forgotten_subjects: [],
          starting_points: [],
        });
      }
      if (url.includes("/api/study-plan/today")) {
        return mockJsonResponse({
          summary: { total_questions: 0, focus_count: 0 },
          items: [],
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("O estudo de hoje, sem ruido.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });
});
