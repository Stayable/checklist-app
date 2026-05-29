import { type Role, type Locale } from "@prisma/client";
import { type DefaultSession } from "next-auth";

// Carry the app's role + locale onto the Auth.js session/JWT so server
// components and (later) RBAC can read them without an extra DB hit.
declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role; locale: Locale } & DefaultSession["user"];
  }
  interface User {
    role: Role;
    locale: Locale;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    locale: Locale;
  }
}
