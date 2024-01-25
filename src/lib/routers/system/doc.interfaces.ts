export interface DocTypeResponse {
    name: string
    path?: string
    generics: DocTypeResponse[]
}

export interface DocCodeResponse {
    content: string
    filePath: string
    startLine: number
    endLine: number
}

export interface DocAttributeResponse {
    name: string
    type?: DocTypeResponse
    docstring?: DocDocstringSectionResponse[]
    path: string
    code: DocCodeResponse
}

export interface DocParameterResponse {
    name: string
    type?: DocTypeResponse
    docstring?: string
}

export interface DocReturnsResponse {
    docstring?: string
    type?: DocTypeResponse
}

export interface DocDecoratorResponse {
    path: string
}

export interface DocFunctionResponse {
    name: string
    docstring: DocDocstringSectionResponse[]
    path: string
    decorators: DocDecoratorResponse[]
    parameters: DocParameterResponse[]
    returns: DocReturnsResponse
    code: DocCodeResponse
}

export interface DocClassResponse {
    name: string
    docstring: DocDocstringSectionResponse[]
    bases: DocTypeResponse[]
    path: string
    attributes: DocAttributeResponse[]
    methods: DocFunctionResponse[]
    code: DocCodeResponse
    inheritedBy: DocTypeResponse[]
}

export interface DocChildModuleResponse {
    name: string
    path: string
    isLeaf: boolean
}

export interface DocDocstringSectionResponse {
    type: 'text' | 'admonition'
    tag?: string
    title?: string
    text: string
}

export interface DocModuleResponse {
    name: string
    docstring: DocDocstringSectionResponse[]
    path: string
    childrenModules: DocChildModuleResponse[]
    attributes: DocAttributeResponse[]
    classes: DocClassResponse[]
    functions: DocFunctionResponse[]
}
