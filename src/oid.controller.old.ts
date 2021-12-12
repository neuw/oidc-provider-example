import { All, Controller, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { Configuration, Provider } from "oidc-provider";

// http://localhost:3000/oidc/auth?client_id=test&response_type=code&scope=openid&redirect_uri=http://localhost:53538/oidc/callback
// http://localhost:3000/oidc/auth?client_id=test&response_type=code&scope=openid%20offline_access&redirect_uri=http://localhost:53538/oidc/callback&prompt=consent
// http://localhost:3000/oidc/auth?client_id=test&response_type=code&scope=openid%20offline_access&redirect_uri=http://localhost:53538/oidc/callback&grant_type=refresh_token

// http://localhost:35553/oidc/auth?client_id=test&redirect_uri=http://localhost:53538/oidc/callback&response_type=code&scope=openid&state=3aaf1d6817534d7298b56c22005e8eab&code_challenge=123123123123123123123123123123123123123123123123123123123123123123123123123123123123123123&code_challenge_method=plain&response_mode=query
const configuration: Configuration = {
  clients: [
    {
      client_id: "test",
      client_secret: "test",
      grant_types: [
        "refresh_token",
        "client_credentials",
        "authorization_code",
      ],
      redirect_uris: ["http://localhost:53538/oidc/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "offline_access openid",
      application_type: "web",
    },
  ],
  ttl: {
    ClientCredentials: 840,
    RefreshToken: 3600 * 24 * 30,
  },
  issueRefreshToken: async (ctx) => {
    return true;
  },
  loadExistingGrant: async (ctx) => {
    const grantId =
      (ctx.oidc.result &&
        ctx.oidc.result.consent &&
        ctx.oidc.result.consent.grantId) ||
      ctx.oidc.session.grantIdFor(ctx.oidc.client.clientId);

    if (grantId) {
      console.log("not in isFirstParty");
      return ctx.oidc.provider.Grant.find(grantId);
    } else if (isFirstParty(ctx.oidc.client)) {
      console.log("in isFirstParty");
      const grant = new ctx.oidc.provider.Grant({
        clientId: ctx.oidc.client.clientId,
        accountId: ctx.oidc.session.accountId,
      });

      grant.addOIDCScope("openid email profile offline_access");
      grant.addOIDCClaims(["first_name"]);
      grant.addResourceScope(
        "urn:example:resource-indicator",
        "api:read api:write"
      );
      await grant.save();
      return grant;
    }
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
    resourceIndicators: {
      defaultResource: (ctx) => {
        return "http://example.com";
      },
      enabled: true,
      getResourceServerInfo: (ctx, resourceIndicator, client) => {
        console.log("resource indicator: ", resourceIndicator, client);
        /*console.log("ctx: ", ctx);
        console.log("ctx req: ", ctx.req);
        console.log("ctx res: ", ctx.res);*/
        return {
          scope: "openid offline_access api:read api:write",
          audience: "resource-server-audience-value",
          accessTokenTTL: 2 * 60 * 60, // 2 hours
          accessTokenFormat: "jwt",
          jwt: {
            sign: { alg: "RS256" },
          },
        };
      },
    },
  },
  formats: {
    customizers: {
      async jwt(ctx, token, jwt) {
        //jwt.header = { foo: "bar" };
        jwt.payload.foo = "bar";
        return jwt;
      },
    },
  },
  pkce: {
    required: (ctx, client) => {
      return false;
    },
    methods: ["plain"],
  },
};

function isFirstParty(ctx) {
  console.log("isFirstParty, ", ctx);
  console.log("ctx.Client ", ctx.clientId);
  if (ctx.clientId === "test") {
    return true;
  }
  return false;
}

const oidc = new Provider("http://localhost:3000", configuration);
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

// http://localhost:35553/oidc/auth?client_id=test&redirect_uri=http://localhost:53538/oidc/callback&response_type=code&scope=openid api:read&state=3aaf1d6817534d7298b56c22005e8eab&code_challenge=123123123123123123123123123123123123123123123123123123123123123123123123123123123123123123&code_challenge_method=plain&response_mode=query&prompt=none
