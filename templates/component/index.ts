/**
 * TODO describe what this component provides.
 *
 * A component is source a consumer owns and edits, so prefer clarity over
 * cleverness and keep the dependency count at zero where possible.
 */

export interface TodoOptions {
  /** TODO describe this option. */
  readonly todo?: string;
  /**
   * Injectable for testing, so a consumer needs no mocking library.
   *
   * Dependency injection over module mocking keeps the tests readable and the
   * component usable in environments where mocking is awkward.
   */
  readonly now?: () => Date;
}

export interface Todo {
  /** TODO describe this method. */
  doSomething(input: string): string;
}

/** TODO describe the factory. */
export function createTodo(options: TodoOptions = {}): Todo {
  const now = options.now ?? ((): Date => new Date());

  return {
    doSomething(input: string): string {
      // TODO implement.
      return `${input} at ${now().toISOString()}`;
    },
  };
}
