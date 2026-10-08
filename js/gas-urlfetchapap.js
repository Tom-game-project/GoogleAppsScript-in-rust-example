// gas::urlfetchapp@0.1.0-alpha
//
//
import { GasHttpResponse } from "./gas-urlfetchapap-httpresponse";

export const fetch = function (url, param) {
    return new GasHttpResponse(UrlFetchApp.fetch(url, param));
}

