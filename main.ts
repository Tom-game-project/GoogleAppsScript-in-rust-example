import {
    $init,
    scream,
    sayHello,
    rsDoGet,
    rsDoPost,
    gitInitRepo,
    gitListRepos,
    gitCreateRepo,
    gitGetCommits,
    gitGetCommitDetail,
    resourceExample,
    helloworldExample,
    getScriptPropertiesExample,
    spreadsheetExample,
    variantFunc00,
    httpRequestTest,
    utilitiesExample,
    htmlServiceExample,
    wasiShowcaseExample,
} from "./target/jco/GoogleAppsScript_in_rust_example.js";
import "./textencoderdecoder";

import { GasTextOutput } from "./js/gas-content-service-text-output";
import { GasHtmlOutput } from "./js/gas-html-service-output";

type WitWebResponse =
    | { tag: "text"; val: GasTextOutput }
    | { tag: "html"; val: GasHtmlOutput };

interface GasGlobal {
    doGet: (
        e: GoogleAppsScript.Events.DoGet,
    ) => GoogleAppsScript.Content.TextOutput | GoogleAppsScript.HTML.HtmlOutput;
    do_get_test00: () => void;
    doPost: (e: GoogleAppsScript.Events.DoPost) => GoogleAppsScript.Content.TextOutput;
    git_init_repo: (repo?: string) => string;
    git_list_repos: () => string;
    git_create_repo: (repo: string, description?: string) => string;
    git_get_commits: (repo: string) => string;
    git_get_commit_detail: (repo: string, commitOid: string) => string;
    aaa: () => void;
    resource_example: () => void;
    helloworldExample: () => void;
    get_script_properties_example: () => void;
    spreadsheet_example: () => void;
    fff: () => void;
    http_request_test: () => void;
    utilities_example: () => void;
    html_service_example: () => GoogleAppsScript.HTML.HtmlOutput;
    wasi_showcase_example: () => void;
}

declare const global: GasGlobal;

function attachWebAppUrl(e: GoogleAppsScript.Events.DoGet | GoogleAppsScript.Events.DoPost): void {
    try {
        if (typeof ScriptApp !== "undefined" && typeof ScriptApp.getService === "function") {
            const url = ScriptApp.getService().getUrl();
            if (url && url.trim() !== "") {
                (e as unknown as Record<string, unknown>).webAppUrl = url.trim();
            }
        }
    } catch {
        // Ignore if ScriptApp.getService() is unavailable
    }
}

global.doGet = function(
    e: GoogleAppsScript.Events.DoGet,
): GoogleAppsScript.Content.TextOutput | GoogleAppsScript.HTML.HtmlOutput {
    attachWebAppUrl(e);
    const r = rsDoGet(JSON.stringify(e)) as unknown as WitWebResponse | GasTextOutput;
    if ("tag" in r) {
        if (r.tag === "html") {
            return r.val.rawHtmlOutput;
        }
        return r.val.rawTextOutput;
    }
    return r.rawTextOutput;
};

global.do_get_test00 = function(): void {
    const a = `
            {
               "parameter": {
                 "service": "git-upload-pack",
                 "git_path": "/sample.git/info/refs"
               },
               "contextPath": "",
               "contentLength": -1,
               "parameters": {
                 "service": [
                   "git-upload-pack"
                 ],
                 "git_path": [
                   "/sample.git/info/refs"
                 ]
               },
               "queryString": "service=git-upload-pack&git_path=/sample.git/info/refs"
             }
    `;
    const r = rsDoGet(a) as unknown as WitWebResponse;
    if (r.tag === "text") {
        Logger.log(r.val.getContent());
    } else {
        Logger.log(r.val.getContent());
    }
};

global.doPost = function(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
    attachWebAppUrl(e);
    const serialized = JSON.stringify(e);
    if (e && e.postData) {
        (e.postData as unknown as Record<string, unknown>).contents = "";
    }
    const r = rsDoPost(serialized) as unknown as GasTextOutput;
    return r.rawTextOutput;
};

global.git_init_repo = function(repo?: string): string {
    return gitInitRepo(repo);
};

global.git_list_repos = function(): string {
    return gitListRepos();
};

global.git_create_repo = function(repo: string, description?: string): string {
    return gitCreateRepo(repo, description);
};

global.git_get_commits = function(repo: string): string {
    return gitGetCommits(repo);
};

global.git_get_commit_detail = function(repo: string, commitOid: string): string {
    return gitGetCommitDetail(repo, commitOid);
};

global.aaa = function(): void {
    const msg = scream("hello world");
    sayHello(msg);
};

global.resource_example = function(): void {
    resourceExample();
};

global.helloworldExample = function(): void {
    helloworldExample();
};

global.get_script_properties_example = function(): void {
    getScriptPropertiesExample();
};

global.spreadsheet_example = function(): void {
    spreadsheetExample();
};

global.fff = function(): void {
    console.log(variantFunc00());
};

global.http_request_test = function(): void {
    httpRequestTest();
};

global.utilities_example = function(): void {
    utilitiesExample();
};

global.html_service_example = function(): GoogleAppsScript.HTML.HtmlOutput {
    const out = htmlServiceExample() as unknown as GasHtmlOutput;
    return out.rawHtmlOutput;
};

global.wasi_showcase_example = function(): void {
    wasiShowcaseExample();
};
