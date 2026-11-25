import { NextResponse } from "next/server";
import { z } from "zod";
import {
  profileBodySchema,
  renameProfileSchema,
  selectProfileSchema,
  tokenBodySchema,
  revokeTokenSchema,
} from "@/api-contract/profiles";
import {
  getCurrentUser,
  hashSecret,
  newSecret,
  selectProfile,
  cookieIdentity,
} from "./currentUser";
import { userRepository } from "@/server/repositories/userRepository";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Never include credentials, request bodies or SQL errors in responses/logs. */
export function profileHandler(run: (req: Request) => Promise<NextResponse>, ownerOnly = false) {
  return async (req: Request) => {
    try {
      if (ownerOnly && !(await getCurrentUser(req))?.is_owner)
        return json({ error: "Owner profile required" }, 403);
      return await run(req);
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return json({ error: "Invalid request" }, 400);
      return json({ error: "Profile operation failed" }, 500);
    }
  };
}
export const listProfiles = profileHandler(async (req) => {
  const current = await getCurrentUser(req);
  const users = await userRepository.list();
  return json({
    users: users.map(({ id, name, is_owner }) => ({ id, name, is_owner })),
    current,
    selected: !!(await cookieIdentity(req)),
  });
});
export const createProfile = profileHandler(async (req) => {
  const body = profileBodySchema.parse(await req.json());
  return json(await userRepository.create(body.name, body.tailscale_login), 201);
}, true);
export const renameProfile = profileHandler(async (req) => {
  const body = renameProfileSchema.parse(await req.json());
  const user = await userRepository.rename(body.id, body.name, body.tailscale_login);
  return user ? json(user) : json({ error: "Profile not found" }, 404);
}, true);
export const chooseProfile = profileHandler(async (req) => {
  const { user_id } = selectProfileSchema.parse(await req.json());
  await userRepository.ensureOwner();
  if (!(await userRepository.list()).some((u) => u.id === user_id))
    return json({ error: "Profile not found" }, 404);
  return selectProfile(req, user_id);
});
export const listTokens = profileHandler(
  async () => json({ tokens: await userRepository.tokens(), users: await userRepository.list() }),
  true,
);
export const createToken = profileHandler(async (req) => {
  const body = tokenBodySchema.parse(await req.json());
  if (!(await userRepository.list()).some((u) => u.id === body.user_id))
    return json({ error: "Profile not found" }, 404);
  const token = newSecret();
  const info = await userRepository.createToken(
    body.user_id,
    body.name,
    body.scope,
    hashSecret(token),
  );
  return json({ ...info, token }, 201);
}, true);
export const revokeToken = profileHandler(async (req) => {
  const { id } = revokeTokenSchema.parse(await req.json());
  await userRepository.revokeToken(id);
  return json({ revoked: true });
}, true);
