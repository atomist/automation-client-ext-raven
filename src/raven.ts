import {
    AutomationContextAware,
    Configuration,
    logger,
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

    private reportError(type: string, ctx: HandlerContext, error: any) {
        const nsp = (ctx as any as AutomationContextAware).context;
        if (error) {
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
}

export async function configureRaven(configuration: Configuration): Promise<Configuration> {
    if (_.get(configuration, "raven.enabled") === true) {
        logger.debug(`Adding Raven listener`);

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
