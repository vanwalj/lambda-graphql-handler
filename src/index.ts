import { graphql, GraphQLSchema } from "graphql";

export interface IHeader {
  [key: string]: string | undefined;
}
export interface IEvent {
  headers?: IHeader;
  httpMethod: string;
  body?: string;
  queryStringParameters?: string;
}
export interface IContext {
  awsRequestId: string;
  functionName: string;
  functionVersion: string;
  callbackWaitsForEmptyEventLoop: boolean;
}

export interface IResponse {
  body?: string;
  headers?: IHeader;
  statusCode?: number;
}
export type TCallback = (err: Error | null, response: IResponse) => void;

export class CreateContextError extends Error {
  name = "CreateContextError";
  constructor(public code?: number, public body?: string) {
    super();
  }
}

export default <Context>({
  createContext,
  onError,
  schema,
}: {
  schema: GraphQLSchema;
  createContext?: (
    event: IEvent,
    context: IContext,
  ) => Promise<Context | CreateContextError>;
  onError?: (e: Error) => Promise<void>;
}) => async (event: IEvent, context: IContext, callback: TCallback) => {
  try {
    const responseHeaders = {
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Origin": event.headers ? event.headers.origin : "*",
      "Content-Type": "application/json",
    };

    const stringQuery =
      event.httpMethod === "POST" ? event.body : event.queryStringParameters;

    if (typeof stringQuery !== "string") {
      return callback(null, {
        body: JSON.stringify({ error: "Empty GraphQL Query" }),
        headers: responseHeaders,
        statusCode: 400,
      });
    }

    let query: any = null;
    try {
      query = JSON.parse(stringQuery);
    } catch (e) {
      return callback(null, {
        body: JSON.stringify({ error: "Unable to parse query", got: query }),
        headers: responseHeaders,
        statusCode: 400,
      });
    }

    const graphQLContext =
      createContext && (await createContext(event, context));

    if (
      graphQLContext instanceof Error &&
      graphQLContext.name === "CreateContextError"
    ) {
      return callback(null, {
        body: (graphQLContext as any).body,
        headers: responseHeaders,
        statusCode: (graphQLContext as any).code || 500,
      });
    }

    const result = await graphql({
      contextValue: graphQLContext,
      operationName: query.operationName,
      schema,
      source: query.query,
      variableValues: query.variables,
    });

    return callback(null, {
      body: JSON.stringify(result),
      headers: responseHeaders,
      statusCode: 200,
    });
  } catch (e) {
    onError && (await onError(e));
    return callback(null, {
      body: JSON.stringify({ error: "Internal server error" }),
      headers: {},
      statusCode: 500,
    });
  }
};
