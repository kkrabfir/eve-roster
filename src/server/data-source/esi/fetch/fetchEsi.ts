import { default as axios, AxiosResponse } from "axios";
import { EsiEndpoint } from "../EsiEndpoint.js";
import { EsiError, EsiErrorKind } from "../EsiError.js";
import { buildEsiFetchConfig } from "./buildEsiFetchConfig.js";
import { checkEsiResponseForWarnings } from "./checkEsiResponseForWarnings.js";
import { EsiEndpointParams } from "./EsiEndpointParams.js";

/**
 * Loads a particular ESI endpoint.
 *
 * If the endpoint is private, `params` must contain a `_token` property.
 * If the endpoint requires a body (usually because it's a POST), `params` must
 * contain a `_body` property of the appropriate type.
 */
export async function fetchEsi<T extends EsiEndpoint>(
  endpoint: T,
  params: EsiEndpointParams<T>
): Promise<T["response"]> {
  const response = await fetchEsiImpl(endpoint, params);
  return response.data;
}

/** See fetchEsiEx. */
export interface EsiResults<T extends EsiEndpoint> {
  data: T["response"];
  pageCount: number;
}

/**
 * Loads data from a particular endpoint, and returns the results along with
 * additional information extracted from the response headers.
 */
export async function fetchEsiEx<T extends EsiEndpoint>(
  endpoint: T,
  params: EsiEndpointParams<T>
): Promise<EsiResults<T>> {
  const response = await fetchEsiImpl(endpoint, params);
  return {
    data: response.data,
    pageCount: parseInt(response.headers?.["x-pages"] || "1") || 1,
  };
}

async function fetchEsiImpl<T extends EsiEndpoint>(
  endpoint: T,
  params: EsiEndpointParams<T>
): Promise<AxiosResponse<T["response"]>> {
  const config = buildEsiFetchConfig(BASE_URL, endpoint, params);

  let response: AxiosResponse<T["response"]>;
  try {
    response = await axios.request<T["response"]>(config);
  } catch (err) {
    let errKind = EsiErrorKind.GENERIC_ERROR;

    if (!axios.isAxiosError(err)) {
      throw err;
    }

    const response: AxiosResponse | undefined = err.response;
    if (response) {
      if (response.status == 401 || response.status == 403) {
        errKind = EsiErrorKind.FORBIDDEN_ERROR;
      } else if (response.status == 404) {
        errKind = EsiErrorKind.NOT_FOUND_ERROR;
      } else if (response.status >= 400 && response.status < 500) {
        errKind = EsiErrorKind.CLIENT_ERROR;
      } else if (response.status >= 500 && response.status < 600) {
        errKind = EsiErrorKind.INTERNAL_SERVER_ERROR;
      }
    } else if (err.request) {
      errKind = EsiErrorKind.IO_ERROR;
    }

    throw new EsiError(
      errKind,
      `${errKind} while fetching "${config.url}"`,
      err
    );
  }

  checkEsiResponseForWarnings(endpoint, response);

  // TODO: Verify data matches expected structure
  return response;
}

export const BASE_URL = "https://esi.evetech.net";
