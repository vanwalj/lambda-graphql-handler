import {
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from "graphql";

import handler, { CreateContextError, IContext, IEvent } from "./";

const workingSchema = new GraphQLSchema({
  query: new GraphQLObjectType({
    fields: {
      hello: {
        resolve: () => "world",
        type: new GraphQLNonNull(GraphQLString),
      },
    },
    name: "RootQuery",
  }),
});

const brokenSchema = new GraphQLSchema({
  query: new GraphQLObjectType({
    fields: {
      hello: {
        resolve: () => {
          throw new Error("Oups");
        },
        type: new GraphQLNonNull(GraphQLString),
      },
    },
    name: "RootQuery",
  }),
});

const triggerHandler = ({
  schema,
  event,
  context,
  createContext,
  onError,
}: {
  schema: GraphQLSchema;
  event: IEvent;
  context: IContext;
  createContext?: any;
  onError?: any;
}) =>
  new Promise<any>((resolve, reject) => {
    handler({ schema, createContext, onError })(event, context, (err, data) => {
      if (err) {
        return reject(err);
      }
      return resolve(data);
    });
  });

describe("GraphQL Lambda handler", () => {
  it("Should return a 400 error when an empty graphql query is provided", async () => {
    expect(
      await triggerHandler({
        context: {
          awsRequestId: "toto",
          callbackWaitsForEmptyEventLoop: false,
          functionName: "hello",
          functionVersion: "32",
        },
        event: {
          httpMethod: "POST",
        },
        schema: workingSchema,
      }),
    ).toEqual({
      body: '{"error":"Empty GraphQL Query"}',
      headers: {
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      statusCode: 400,
    });
  });

  it("Should return a 400 error when an invalid JSON query is provided", async () => {
    expect(
      await triggerHandler({
        context: {
          awsRequestId: "toto",
          callbackWaitsForEmptyEventLoop: false,
          functionName: "hello",
          functionVersion: "32",
        },
        event: {
          body: "{{{{ NOT A JSON",
          httpMethod: "POST",
        },
        schema: workingSchema,
      }),
    ).toEqual({
      body: '{"error":"Unable to parse query","got":null}',
      headers: {
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      statusCode: 400,
    });
  });

  it("Should return a 200 with a graphql payload when everything went fine", async () => {
    expect(
      await triggerHandler({
        context: {
          awsRequestId: "toto",
          callbackWaitsForEmptyEventLoop: false,
          functionName: "hello",
          functionVersion: "32",
        },
        event: {
          body: JSON.stringify({ query: "{ hello }" }),
          httpMethod: "POST",
        },
        schema: workingSchema,
      }),
    ).toEqual({
      body: '{"data":{"hello":"world"}}',
      headers: {
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      statusCode: 200,
    });
  });

  it("Should allow all origins", async () => {
    expect(
      await triggerHandler({
        context: {
          awsRequestId: "toto",
          callbackWaitsForEmptyEventLoop: false,
          functionName: "hello",
          functionVersion: "32",
        },
        event: {
          body: JSON.stringify({ query: "{ hello }" }),
          headers: {
            origin: "toto.com",
          },
          httpMethod: "POST",
        },
        schema: workingSchema,
      }),
    ).toEqual({
      body: '{"data":{"hello":"world"}}',
      headers: {
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Origin": "toto.com",
        "Content-Type": "application/json",
      },
      statusCode: 200,
    });
  });

  it("Should take the query string as a parameter when the HTTP method is GET", async () => {
    expect(
      await triggerHandler({
        context: {
          awsRequestId: "toto",
          callbackWaitsForEmptyEventLoop: false,
          functionName: "hello",
          functionVersion: "32",
        },
        event: {
          headers: {
            origin: "toto.com",
          },
          httpMethod: "GET",
          queryStringParameters: JSON.stringify({ query: "{ hello }" }),
        },
        schema: workingSchema,
      }),
    ).toEqual({
      body: '{"data":{"hello":"world"}}',
      headers: {
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Origin": "toto.com",
        "Content-Type": "application/json",
      },
      statusCode: 200,
    });
  });

  it("Should return a 200 with a graphql error when an error is thrown within the schema", async () => {
    expect(
      await triggerHandler({
        context: {
          awsRequestId: "toto",
          callbackWaitsForEmptyEventLoop: false,
          functionName: "hello",
          functionVersion: "32",
        },
        event: {
          body: JSON.stringify({ query: "{ hello }" }),
          httpMethod: "POST",
        },
        schema: brokenSchema,
      }),
    ).toEqual({
      body:
        '{"errors":[{"message":"Oups","locations":[{"line":1,"column":3}],"path":["hello"]}],"data":null}',
      headers: {
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      statusCode: 200,
    });
  });

  it("Should return a 500 when an expected error happen", async () => {
    expect(
      await triggerHandler({
        context: {
          awsRequestId: "toto",
          callbackWaitsForEmptyEventLoop: false,
          functionName: "hello",
          functionVersion: "32",
        },
        event: {
          body: JSON.stringify({ query: "{ hello }" }),
          httpMethod: "POST",
        },
        schema: (() => {
          throw new Error("Oups");
        }) as any,
      }),
    ).toEqual({
      body: '{"error":"Internal server error"}',
      headers: {},
      statusCode: 500,
    });
  });

  it("Should call the onError callback if an unexpected error happen and the onError is provided", async () => {
    const onError = jest.fn(x => x);
    expect(
      await triggerHandler({
        context: {
          awsRequestId: "toto",
          callbackWaitsForEmptyEventLoop: false,
          functionName: "hello",
          functionVersion: "32",
        },
        event: {
          body: JSON.stringify({ query: "{ hello }" }),
          httpMethod: "POST",
        },
        onError,
        schema: (() => {
          throw new Error("Oups");
        }) as any,
      }),
    ).toEqual({
      body: '{"error":"Internal server error"}',
      headers: {},
      statusCode: 500,
    });

    expect(onError.mock.calls.length).toEqual(1);
  });

  it("Should return a custom error if create context return an error", async () => {
    expect(
      await triggerHandler({
        context: {
          awsRequestId: "toto",
          callbackWaitsForEmptyEventLoop: false,
          functionName: "hello",
          functionVersion: "32",
        },
        createContext: async () => {
          return new CreateContextError(123, JSON.stringify({ err: "noooes" }));
        },
        event: {
          body: JSON.stringify({ query: "{ hello }" }),
          httpMethod: "POST",
        },
        schema: workingSchema,
      }),
    ).toEqual({
      body: '{"err":"noooes"}',
      headers: {
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      statusCode: 123,
    });
  });

  it("Should return a 500 error if create context return an error without a code", async () => {
    expect(
      await triggerHandler({
        context: {
          awsRequestId: "toto",
          callbackWaitsForEmptyEventLoop: false,
          functionName: "hello",
          functionVersion: "32",
        },
        createContext: async () => {
          return new CreateContextError(
            undefined,
            JSON.stringify({ err: "noooes" }),
          );
        },
        event: {
          body: JSON.stringify({ query: "{ hello }" }),
          httpMethod: "POST",
        },
        schema: workingSchema,
      }),
    ).toEqual({
      body: '{"err":"noooes"}',
      headers: {
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      statusCode: 500,
    });
  });
});
