import * as querystring from "querystring";
import { default as axios } from "axios";

import { AccessToken } from "../../db/tables.js";
import { AccessTokenErrorType } from "../../error/AccessTokenError.js";
import { fileURLToPath } from "url";
import { buildLoggerFromFilename } from "../../infra/logging/buildLogger.js";

import { fetchAuthInfo } from "./jwt.js";
import { Env } from "../../infra/init/Env.js";
import { generateSsoAuthToken } from "./generateSsoAuthCode.js";

const logger = buildLoggerFromFilename(fileURLToPath(import.meta.url));

/**
 * Class for refreshing access tokens. Given a refresh token, returns a
 * new access token.
 */
export class TokenRefresher {
  private _ssoAuthCode: string;
  private _activeRequests = new Map<number, Promise<RefreshResult>>();

  constructor(env: Env) {
    this._ssoAuthCode = generateSsoAuthToken(
      env.SSO_CLIENT_ID,
      env.SSO_SECRET_KEY
    );
  }

  /**
   * Asks CCP for a new access token for this character. If the request
   * succeeds, an updated DB row is returned. It's up to the caller to commit
   * this row to the DB.
   *
   * Multiple calls to this method for the same character will be coalesced
   * into a single refresh request. Callers should check the `isOriginalRequest`
   * field to determine whether they need to commit the result row to the DB.
   */
  public refreshAccessToken(row: RowToRefresh) {
    let request = this._activeRequests.get(row.accessToken_character);
    if (request == undefined) {
      request = this._refreshAccessToken(row).then((result) => {
        this._activeRequests.delete(row.accessToken_character);
        return result;
      });
      this._activeRequests.set(row.accessToken_character, request);
    } else {
      request = request.then((row) => {
        const copy = Object.assign({}, row);
        copy.isOriginalRequest = false;
        return copy;
      });
    }
    return request;
  }

  private async _refreshAccessToken(row: RowToRefresh): Promise<RefreshResult> {
    const result: RefreshResult = {
      characterId: row.accessToken_character,
      isOriginalRequest: true,
      row: null,
      errorType: null,
    };

    if (!row.accessToken_refreshToken) {
      // An empty refresh token means we don't currently have valid SSO for this
      // character, and should not even attempt to refresh the access token.
      result.errorType = AccessTokenErrorType.TOKEN_REFRESH_REJECTED;
      return result;
    }

    try {
      const response = await this._postRefreshRequest(
        row.accessToken_refreshToken
      );

      const authInfo = await fetchAuthInfo(response.data.access_token);

      result.row = {
        accessToken_character: row.accessToken_character,
        accessToken_accessToken: response.data.access_token,
        accessToken_accessTokenExpires: (authInfo.exp || 0) * 1000,
        accessToken_refreshToken: response.data.refresh_token,
        accessToken_needsUpdate: false,
      };
    } catch (e) {
      if (!axios.isAxiosError(e)) {
        throw e;
      }

      if (e.response) {
        if (e.response.status == 400) {
          logger.info(
            `Access token refresh request was rejected for char ` +
              `${row.accessToken_character}.`
          );
          result.errorType = AccessTokenErrorType.TOKEN_REFRESH_REJECTED;
          result.row = {
            accessToken_character: row.accessToken_character,
            accessToken_accessToken: "",
            accessToken_accessTokenExpires: 0,
            accessToken_refreshToken: "",
            accessToken_needsUpdate: true,
          };
        } else {
          result.errorType = AccessTokenErrorType.HTTP_FAILURE;
          logger.error(
            `HTTP error while refreshing token for ` +
              `${row.accessToken_character}.`
          );
          logger.error(e.message);
        }
      } else {
        result.errorType = AccessTokenErrorType.HTTP_FAILURE;
        logger.error(
          `Generic error while refreshing token for ` +
            `${row.accessToken_character}.`
        );
        logger.error(e.message);
      }
    }

    return result;
  }

  private _postRefreshRequest(refreshToken: string) {
    return axios.post<SsoTokenRefreshResponse>(
      "https://login.eveonline.com/v2/oauth/token",
      querystring.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      {
        headers: {
          Authorization: "Basic " + this._ssoAuthCode,
        },
        timeout: REQUEST_TIMEOUT,
      }
    );
  }
}

const REQUEST_TIMEOUT = 10000;

interface SsoTokenRefreshResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
}

export type RowToRefresh = Pick<
  AccessToken,
  "accessToken_character" | "accessToken_refreshToken"
>;

export interface RefreshResult {
  characterId: number;
  isOriginalRequest: boolean;
  row: AccessTokenUpdate | null;
  errorType: AccessTokenErrorType | null;
}

export type AccessTokenUpdate = Pick<
  AccessToken,
  | "accessToken_character"
  | "accessToken_accessToken"
  | "accessToken_accessTokenExpires"
  | "accessToken_refreshToken"
  | "accessToken_needsUpdate"
>;
