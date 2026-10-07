import { describe, expect, it } from "vitest";
import { fileSharedEmail, memberAddedEmail } from "../templates";

const base = {
  recipient: "rita@example.com",
  recipientLocale: "pt",
  hasAccount: true,
  itemName: "Orçamento <2027>",
  itemKind: "spreadsheet" as const,
  role: "editor" as const,
  senderName: "Ana\nLopes",
  senderEmail: "ana@example.com",
  url: "https://nuvenca.example/spreadsheet/1",
};

describe("notification emails", () => {
  it("writes in the recipient's language", () => {
    const email = fileSharedEmail(base, "en");
    expect(email.subject).toBe("Ana Lopes partilhou “Orçamento <2027>” consigo");
    expect(email.text).toContain("partilhou uma folha de cálculo consigo");
    expect(email.text).toContain("Pode editar.");
    expect(email.replyTo).toBe("ana@example.com");
  });

  it("falls back to the sharer's language for people without an account", () => {
    const email = fileSharedEmail({ ...base, recipientLocale: null, hasAccount: false, itemKind: "folder", role: "viewer" }, "en");
    expect(email.subject).toBe("Ana Lopes shared the folder “Orçamento <2027>” with you");
    expect(email.text).toContain("Create your free account");
    expect(email.text).toContain("sign up to Nuvenca with this email address: rita@example.com");
  });

  it("escapes names and messages in HTML", () => {
    const email = fileSharedEmail({ ...base, message: "<script>alert(1)</script>" });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("Orçamento &lt;2027&gt;");
    expect(email.subject).not.toContain("\n");
  });

  it("announces team membership", () => {
    const email = memberAddedEmail({
      recipient: "rui@example.com",
      recipientLocale: "en",
      workspaceName: "Equipa Norte",
      senderName: "Ana",
      senderEmail: "ana@example.com",
      url: "https://nuvenca.example/workspaces/1",
    });
    expect(email.subject).toBe("Ana added you to the team “Equipa Norte”");
    expect(email.html).toContain('href="https://nuvenca.example/workspaces/1"');
  });
});
