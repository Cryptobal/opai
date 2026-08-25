import type { TemplateSignerRole } from "./constants";

export type ResolvedSigner = {
  role: TemplateSignerRole;
  name: string;
  email: string;
  rut: string | null;
  signingOrder: number;
  autoStamp: boolean;
  warning?: string;
};

export class ResolveSignersError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResolveSignersError";
  }
}
