/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Menu } from "lucide-react";
import {
  IslandModuleProvider,
  useIslandModule,
  useSetIslandModuleMenu,
  useSetIslandSearch,
  useSetIslandSuppressed,
} from "../IslandModuleContext";

function Reader() {
  const { moduleMenu, search, suppressed } = useIslandModule();
  return (
    <div>
      <span data-testid="menu">{moduleMenu?.label ?? "none"}</span>
      <span data-testid="badge">{moduleMenu?.badge ?? 0}</span>
      <span data-testid="search">{search?.placeholder ?? "none"}</span>
      <span data-testid="value">{search?.value ?? ""}</span>
      <span data-testid="suppressed">{String(suppressed)}</span>
    </div>
  );
}

function Publisher({
  badge = 0,
  query = "",
  suppressed = false,
  publish = true,
}: {
  badge?: number;
  query?: string;
  suppressed?: boolean;
  publish?: boolean;
}) {
  useSetIslandModuleMenu(
    publish
      ? {
          icon: Menu,
          label: "Carpetas y filtros",
          badge,
          onOpen: () => {},
        }
      : null,
  );
  useSetIslandSearch(
    publish
      ? {
          placeholder: "Buscá lo que recordás",
          value: query,
          onChange: () => {},
          onExit: () => {},
        }
      : null,
  );
  useSetIslandSuppressed(suppressed);
  return null;
}

describe("IslandModuleContext", () => {
  it("publica menú, búsqueda y limpia al desmontar", () => {
    const { rerender, unmount } = render(
      <IslandModuleProvider>
        <Publisher badge={9} query="hola" />
        <Reader />
      </IslandModuleProvider>,
    );
    expect(screen.getByTestId("menu").textContent).toBe("Carpetas y filtros");
    expect(screen.getByTestId("badge").textContent).toBe("9");
    expect(screen.getByTestId("search").textContent).toBe("Buscá lo que recordás");
    expect(screen.getByTestId("value").textContent).toBe("hola");

    rerender(
      <IslandModuleProvider>
        <Publisher publish={false} />
        <Reader />
      </IslandModuleProvider>,
    );
    expect(screen.getByTestId("menu").textContent).toBe("none");
    expect(screen.getByTestId("search").textContent).toBe("none");

    // Remount and unmount publisher
    rerender(
      <IslandModuleProvider>
        <Publisher badge={3} />
        <Reader />
      </IslandModuleProvider>,
    );
    expect(screen.getByTestId("menu").textContent).toBe("Carpetas y filtros");
    unmount();
  });

  it("suppressed refleja el flag del módulo", () => {
    render(
      <IslandModuleProvider>
        <Publisher suppressed />
        <Reader />
      </IslandModuleProvider>,
    );
    expect(screen.getByTestId("suppressed").textContent).toBe("true");
  });

  it("actualiza value de búsqueda sin perder el contrato", () => {
    const { rerender } = render(
      <IslandModuleProvider>
        <Publisher query="" />
        <Reader />
      </IslandModuleProvider>,
    );
    expect(screen.getByTestId("value").textContent).toBe("");
    act(() => {
      rerender(
        <IslandModuleProvider>
          <Publisher query="from:a" />
          <Reader />
        </IslandModuleProvider>,
      );
    });
    expect(screen.getByTestId("search").textContent).toBe("Buscá lo que recordás");
    expect(screen.getByTestId("value").textContent).toBe("from:a");
  });
});
