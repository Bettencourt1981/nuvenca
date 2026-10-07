import "server-only";
import { requireUser } from "@/lib/auth";
import { getItem, getProfile, getWorkspaces } from "@/lib/data/drive";
import { nativeType, type NativeType } from "@/lib/editors/native";
import { ACCESS } from "@/lib/types";

/** Everything an editor page needs, or null when the file can't be opened. */
export async function loadEditorContext(fileId: string, expected: NativeType) {
  const [user, file, profile, workspaces] = await Promise.all([
    requireUser(),
    getItem(fileId),
    getProfile(),
    getWorkspaces(),
  ]);
  if (!file || file.trashedAt || nativeType(file.mimeType) !== expected) return null;

  const workspace = workspaces.find((w) => w.id === file.workspaceId);
  const personal = workspaces.find((w) => w.kind === "personal")!;
  const backHref = file.parentId
    ? `/drive/folders/${file.parentId}`
    : workspace
      ? workspace.kind === "personal"
        ? "/drive"
        : `/workspaces/${workspace.id}`
      : "/shared";
  // New files go next to this one when possible, otherwise to "My files".
  const location =
    file.accessLevel >= ACCESS.editor
      ? { workspaceId: file.workspaceId, parentId: file.parentId }
      : { workspaceId: personal.id, parentId: null };

  return {
    file: { id: file.id, name: file.name, starred: file.starred, accessLevel: file.accessLevel, type: expected },
    user: { id: user.id, name: profile.fullName || profile.email },
    backHref,
    location,
  };
}
