import { All, Controller, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { Configuration, interactionPolicy, Provider } from "oidc-provider";

const configuration: Configuration = {
  clients: [
    {
      client_id: "test",
      client_secret: "test",
      grant_types: ["client_credentials", "authorization_code"],
      redirect_uris: ["http://localhost:53538/oidc/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "openid",
      application_type: "web",
    },
  ],
  ttl: {
    ClientCredentials: 840,
    RefreshToken: 3600 * 24 * 30,
    AccessToken: 840,
    IdToken: 840,
    Session: 840,
  },
  /*issueRefreshToken: async (ctx) => {
    return true;
  },*/
  loadExistingGrant: async (ctx) => {
    const grantId =
      (ctx.oidc.result &&
        ctx.oidc.result.consent &&
        ctx.oidc.result.consent.grantId) ||
      ctx.oidc.session.grantIdFor(ctx.oidc.client.clientId);

    if (grantId) {
      /*console.log("not in isFirstParty");*/
      return ctx.oidc.provider.Grant.find(grantId);
    } else if (isFirstParty(ctx.oidc.client)) {
      /*console.log("in isFirstParty", ctx);*/
      const grant = new ctx.oidc.provider.Grant({
        clientId: ctx.oidc.client.clientId,
        accountId: ctx.oidc.session.accountId,
      });

      grant.addOIDCScope("openid email profile offline_access");
      grant.addOIDCClaims([]);
      await grant.save();
      return grant;
    }
    return undefined;
  },
  features: {
    clientCredentials: {
      enabled: true,
    },
    jwtResponseModes: {
      enabled: true,
    },
    introspection: {
      enabled: true,
    },
    jwtIntrospection: {
      enabled: true,
    },
  },
  formats: {
    customizers: {
      async jwt(ctx, token, jwt) {
        jwt.payload.foo = "bar";
        return jwt;
      },
    },
  },
  pkce: {
    required: (ctx, client) => {
      return false;
    },
    methods: ["plain", "S256"],
  },
  findAccount: async (ctx, sub, token) => {
    console.log("findAccount ctx", ctx);
    console.log("findAccount sub", sub);
    console.log("findAccount token", token);
    return {
      accountId: sub,
      async claims(use, scope, claims, rejected) {
        return { sub };
      },
    };
  },
};

function isFirstParty(ctx) {
  if (ctx.clientId === "test") {
    return true;
  }
  return false;
}

const oidc = new Provider(
  "https://example.com",
  configuration
);
oidc.proxy = true;
const callback = oidc.callback();

function handleClientAuthErrors(
  { headers: { authorization }, oidc: { body, client } },
  err
) {
  if (err.statusCode === 401 && err.message === "invalid_client") {
    console.log(err);
  } else {
    console.log(err);
  }
}
oidc.on("grant.error", handleClientAuthErrors);
oidc.on("introspection.error", handleClientAuthErrors);
oidc.on("revocation.error", handleClientAuthErrors);

@Controller("oidc")
export class OidcController {
  @All("/*")
  public mountedOidc(@Req() req: Request, @Res() res: Response): void {
    req.url = req.originalUrl.replace("/oidc", "");
    return callback(req, res);
  }
}

// http://localhost:35553/oidc/auth?client_id=test&redirect_uri=http://localhost:53538/oidc/callback&response_type=code&scope=openid&state=3aaf1d6817534d7298b56c22005e8eab&code_challenge=123123123123123123123123123123123123123123123123123123123123123123123123123123123123123123&code_challenge_method=plain&response_mode=query
// https://example.com/oidc/auth?client_id=test&redirect_uri=http://localhost:53538/oidc/callback&response_type=code&scope=openid&state=3aaf1d6817534d7298b56c22005e8eab&code_challenge=123123123123123123123123123123123123123123123123123123123123123123123123123123123123123123&code_challenge_method=plain&response_mode=query
