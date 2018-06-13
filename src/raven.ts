/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    AutomationContextAware,
    Configuration,
} from "@atomist/automation-client";
import { EventFired } from "@atomist/automation-client/HandleEvent";
import { HandlerContext } from "@atomist/automation-client/HandlerContext";
import { CommandInvocation } from "@atomist/automation-client/internal/invoker/Payload";
import { AutomationEventListenerSupport } from "@atomist/automation-client/server/AutomationEventListener";
import * as appRoot from "app-root-path";
import * as _ from "lodash";

export class RavenAutomationEventListener extends AutomationEventListenerSupport {

    constructor(private raven: any) {
        super();
    }

    public commandFailed(payload: CommandInvocation, ctx: HandlerContext, err: any): Promise<any> {
        this.reportError("CommandHandler", ctx, err);
        return Promise.resolve();
    }

    public eventFailed(payload: EventFired<any>, ctx: HandlerContext, err: any): Promise<any> {
        this.reportError("EventHandler", ctx, err);
        return Promise.resolve();
    }

    private reportError(type: string, ctx: HandlerContext, err: any) {
        const nsp = (ctx as any as AutomationContextAware).context;
        if (!err) {
            return;
        }

        if (typeof err === "boolean") {
            return;
        }

        let error = err;
        // Check if err is an Error instance and if not see if it is a HandlerFailure
        // with a wrapped Error
        if (!(err instanceof Error) && err.error && err.error instanceof Error) {
            error = err.error;
        }

        this.raven.captureException(
            error,
            {
                extra: {
                    operation_type: type,
                    operation_name: nsp.operation,
                    artifact: nsp.name,
                    version: nsp.version,
                    team_id: nsp.teamId,
                    team_name: nsp.teamName,
                    correlation_id: nsp.correlationId,
                    invocation_id: nsp.invocationId,
                },
            });
    }
}

export async function configureRaven(configuration: Configuration): Promise<Configuration> {
    if (_.get(configuration, "raven.enabled") === true) {

        const dsn = configuration.raven.dsn;
        if (!dsn) {
            throw new Error ("Raven dsn is missing. Please set 'raven.dsn' in your configuration.");
        }

        const gi = require(`${appRoot.path}/git-info.json`);
        const gitUrlParse = require("git-url-parse");
        const gitUrl = gitUrlParse(gi.repository);

        try {
            const Raven = require("raven");

            Raven.config(dsn, {
                name: configuration.name,
                release: configuration.version,
                environment: configuration.environment,
                extra: {
                    git_sha: gi.sha,
                    git_owner: gitUrl.owner,
                    git_repo: gitUrl.name,
                    environment: configuration.environment,
                },
            }).install();

            configuration.listeners.push(new RavenAutomationEventListener(Raven));

        } catch (err) {
            throw new Error("Raven can't be loaded. Please install with 'npm install raven --save'.");
        }
    }
    return configuration;
}
