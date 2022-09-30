import { Router } from '@youwol/http-clients'
import { CustomCommandsRouter } from './custom-commands'
import { EnvironmentRouter } from './environment'
import { LocalCdnRouter } from './local-cdn'
import { ProjectsRouter } from './projects'
import { SystemRouter } from './system'
import { WsRouter } from '../py-youwol.client'

export class AdminRouter extends Router {
    public readonly customCommands: CustomCommandsRouter
    public readonly environment: EnvironmentRouter
    public readonly projects: ProjectsRouter
    public readonly system: SystemRouter
    public readonly localCdn: LocalCdnRouter

    constructor(parent: Router, ws: WsRouter) {
        super(parent.headers, `${parent.basePath}/admin`)
        this.customCommands = new CustomCommandsRouter(this, ws)
        this.environment = new EnvironmentRouter(this, ws)
        this.projects = new ProjectsRouter(this, ws)
        this.system = new SystemRouter(this, ws)
        this.localCdn = new LocalCdnRouter(this, ws)
    }
}
