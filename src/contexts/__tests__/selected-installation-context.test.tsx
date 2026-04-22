import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  SelectedInstallationProvider,
  useSelectedInstallation,
  __INTERNAL_FOR_TESTS,
} from "../selected-installation-context";

const { STORAGE_KEY, URL_PARAM, resolveInitialId } = __INTERNAL_FOR_TESTS;

function TestConsumer() {
  const { installationId, installation, hasMultiple, setInstallationId, installations } =
    useSelectedInstallation();
  return (
    <div>
      <span data-testid="id">{installationId}</span>
      <span data-testid="name">{installation?.name ?? "none"}</span>
      <span data-testid="multi">{String(hasMultiple)}</span>
      <span data-testid="count">{installations.length}</span>
      <button
        data-testid="switch"
        onClick={() => setInstallationId(installations[1]?.id ?? "")}
      >
        switch
      </button>
      <button
        data-testid="switch-invalid"
        onClick={() => setInstallationId("instalacion-de-otro-tenant")}
      >
        invalid
      </button>
    </div>
  );
}

const INSTALLATIONS = [
  { id: "inst-1", name: "Bodega Santa Amalia" },
  { id: "inst-2", name: "Bodega Lo Aguirre" },
  { id: "inst-3", name: "Santiago Centro" },
];

const originalHref = "http://localhost/portal/cliente";

function setUrl(href: string) {
  window.history.replaceState(null, "", href);
}

describe("SelectedInstallationContext", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setUrl(originalHref);
  });

  afterEach(() => {
    window.localStorage.clear();
    setUrl(originalHref);
  });

  describe("resolución inicial", () => {
    it("usa la primera instalación cuando no hay URL ni localStorage", () => {
      render(
        <SelectedInstallationProvider installations={INSTALLATIONS}>
          <TestConsumer />
        </SelectedInstallationProvider>,
      );
      expect(screen.getByTestId("id").textContent).toBe("inst-1");
      expect(screen.getByTestId("name").textContent).toBe("Bodega Santa Amalia");
      expect(screen.getByTestId("multi").textContent).toBe("true");
    });

    it("usa el valor de ?instalacion=<id> si es válido", () => {
      setUrl(`${originalHref}?${URL_PARAM}=inst-2`);
      render(
        <SelectedInstallationProvider installations={INSTALLATIONS}>
          <TestConsumer />
        </SelectedInstallationProvider>,
      );
      expect(screen.getByTestId("id").textContent).toBe("inst-2");
    });

    it("ignora ?instalacion=<id> si no pertenece a las autorizadas (tenant isolation)", () => {
      setUrl(`${originalHref}?${URL_PARAM}=inst-de-otro-tenant`);
      render(
        <SelectedInstallationProvider installations={INSTALLATIONS}>
          <TestConsumer />
        </SelectedInstallationProvider>,
      );
      expect(screen.getByTestId("id").textContent).toBe("inst-1");
    });

    it("usa localStorage si no hay URL válida", () => {
      window.localStorage.setItem(STORAGE_KEY, "inst-3");
      render(
        <SelectedInstallationProvider installations={INSTALLATIONS}>
          <TestConsumer />
        </SelectedInstallationProvider>,
      );
      expect(screen.getByTestId("id").textContent).toBe("inst-3");
    });

    it("la URL tiene prioridad sobre localStorage", () => {
      window.localStorage.setItem(STORAGE_KEY, "inst-3");
      setUrl(`${originalHref}?${URL_PARAM}=inst-2`);
      render(
        <SelectedInstallationProvider installations={INSTALLATIONS}>
          <TestConsumer />
        </SelectedInstallationProvider>,
      );
      expect(screen.getByTestId("id").textContent).toBe("inst-2");
    });

    it("ignora un valor en localStorage que ya no esté autorizado", () => {
      window.localStorage.setItem(STORAGE_KEY, "inst-eliminada");
      render(
        <SelectedInstallationProvider installations={INSTALLATIONS}>
          <TestConsumer />
        </SelectedInstallationProvider>,
      );
      expect(screen.getByTestId("id").textContent).toBe("inst-1");
    });
  });

  describe("hasMultiple", () => {
    it("es false cuando hay una sola instalación", () => {
      render(
        <SelectedInstallationProvider installations={[INSTALLATIONS[0]]}>
          <TestConsumer />
        </SelectedInstallationProvider>,
      );
      expect(screen.getByTestId("multi").textContent).toBe("false");
    });

    it("es false cuando hay cero instalaciones", () => {
      render(
        <SelectedInstallationProvider installations={[]}>
          <TestConsumer />
        </SelectedInstallationProvider>,
      );
      expect(screen.getByTestId("id").textContent).toBe("");
      expect(screen.getByTestId("multi").textContent).toBe("false");
    });
  });

  describe("setInstallationId", () => {
    it("cambia la instalación activa y persiste en localStorage y URL", () => {
      render(
        <SelectedInstallationProvider installations={INSTALLATIONS}>
          <TestConsumer />
        </SelectedInstallationProvider>,
      );

      act(() => {
        screen.getByTestId("switch").click();
      });

      expect(screen.getByTestId("id").textContent).toBe("inst-2");
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe("inst-2");
      const url = new URL(window.location.href);
      expect(url.searchParams.get(URL_PARAM)).toBe("inst-2");
    });

    it("rechaza silenciosamente un id que no esté en la lista autorizada", () => {
      render(
        <SelectedInstallationProvider installations={INSTALLATIONS}>
          <TestConsumer />
        </SelectedInstallationProvider>,
      );

      act(() => {
        screen.getByTestId("switch-invalid").click();
      });

      expect(screen.getByTestId("id").textContent).toBe("inst-1");
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe("reactividad al cambio de instalaciones", () => {
    it("cae a la primera cuando la actual desaparece de la lista", () => {
      window.localStorage.setItem(STORAGE_KEY, "inst-3");
      const { rerender } = render(
        <SelectedInstallationProvider installations={INSTALLATIONS}>
          <TestConsumer />
        </SelectedInstallationProvider>,
      );
      expect(screen.getByTestId("id").textContent).toBe("inst-3");

      rerender(
        <SelectedInstallationProvider
          installations={[INSTALLATIONS[0], INSTALLATIONS[1]]}
        >
          <TestConsumer />
        </SelectedInstallationProvider>,
      );
      expect(screen.getByTestId("id").textContent).toBe("inst-1");
    });

    it("vacía el id cuando todas las instalaciones desaparecen", () => {
      const { rerender } = render(
        <SelectedInstallationProvider installations={INSTALLATIONS}>
          <TestConsumer />
        </SelectedInstallationProvider>,
      );
      rerender(
        <SelectedInstallationProvider installations={[]}>
          <TestConsumer />
        </SelectedInstallationProvider>,
      );
      expect(screen.getByTestId("id").textContent).toBe("");
    });
  });
});

describe("resolveInitialId (helper puro)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setUrl(originalHref);
  });

  it("retorna '' cuando no hay instalaciones", () => {
    expect(resolveInitialId([])).toBe("");
  });

  it("prefiere URL sobre localStorage", () => {
    window.localStorage.setItem(STORAGE_KEY, "inst-2");
    setUrl(`${originalHref}?${URL_PARAM}=inst-3`);
    expect(resolveInitialId(INSTALLATIONS)).toBe("inst-3");
  });
});
