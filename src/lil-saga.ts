interface Undoable {
  undo(): Promise<unknown> | unknown;
}

interface Saga extends Undoable {
  do(): Promise<unknown> | unknown;
}

interface SagaGenerator {
  (): Iterator<
    Saga
    | Promise<unknown>
    | Array<Saga | Promise<unknown>>
  >
}

function isPromise(value: any): value is Promise<unknown> {
  /* $lab:coverage:off$ */
  return value && typeof value.then === 'function';
  /* $lab:coverage:on$ */
}

function isSaga(value: any): value is Saga {
  /* $lab:coverage:off$ */
  return value && typeof value.do === 'function' && typeof value.undo === 'function';
  /* $lab:coverage:on$ */
}

function returnNothing() {}

class SettledValue<T> {
  value: T;

  constructor(value: T) {
    this.value = value;
  }
}

class SettledError {
  reason: Error;

  constructor(reason: Error) {
    this.reason = reason;
  }
}

function errToSettled(reason: Error) {
  return new SettledError(reason);
}

function valueToSettled<T>(value: T) {
  return new SettledValue(value);
}

class ConcurrentUndoable implements Undoable {
  items: Undoable[];
  onUndoError: (err: Error) => void;

  constructor(onUndoError: (err: Error) => void) {
    this.items = [];
    this.onUndoError = onUndoError;
  }

  undo() {
    return Promise
      .all(this.items.map(undoable => {
        return Promise.resolve()
          .then(() => undoable.undo())
          .catch(this.onUndoError);
      }))
      .then(returnNothing);
  }
}

interface LilSagaOptions {
  /**
   * Errors during undo are not propgated so that they cannot prevent other undos.
   * This function will be called with any errors that occur during some undo.
   */
  onUndoError?: (err: Error) => void
}

export default function lilSaga(
  steps: SagaGenerator,
  { onUndoError = console.error.bind(console) }: LilSagaOptions = {}
): Promise<void> {
  const undoables: Undoable[] = [];
  const iter = steps();

  const rollbackDone = (err: Error): Promise<void> => {
    return undoables
      .reduceRight((prev, undoable): Promise<any> => {
        return prev.then(() => {
          return Promise.resolve()
            .then(() => undoable.undo())
            .catch(onUndoError);
        });
      }, Promise.resolve())
      .then(() => {
        throw err;
      });
  };

  function performConcurrentSteps(value: Array<Saga | Promise<unknown>>) {
    const concurrentUndoable = new ConcurrentUndoable(onUndoError);
    undoables.push(concurrentUndoable);

    function performConcurrentStep(
      concurrentStep: Saga | Promise<unknown>
    ): Promise<SettledValue<unknown> | SettledError> | SettledValue<unknown> | SettledError {
      if (isPromise(concurrentStep)) {
        return concurrentStep.then(valueToSettled, errToSettled);
      }

      if (isSaga(concurrentStep)) {
        return Promise.resolve()
          .then(() => concurrentStep.do())
          .then((stepResult: unknown) => {
            concurrentUndoable.items.push(concurrentStep);

            return new SettledValue(stepResult);
          }, errToSettled);
      }

      return Promise.reject(new Error(`lil-saga concurrent steps must be either a Promise or a Saga, was ${concurrentStep}`));
    }

    function settledToResults(settleds: Array<SettledValue<unknown> | SettledError>) {
      const results = [];

      for (const settled of settleds) {
        if (settled instanceof SettledError) {
          return rollbackDone(settled.reason);
        }

        results.push(settled.value);
      }

      return performNextStep(results);
    }

    return Promise
      .all(value.map(performConcurrentStep))
      .then(settledToResults);
  }

  function performNextStep(preStepResult?: unknown): Promise<void> {
    try {
      const { value, done } = iter.next(preStepResult);

      if (done === true) {
        return Promise.resolve();
      }

      if (Array.isArray(value)) {
        return performConcurrentSteps(value);
      }

      if (isPromise(value)) {
        return value.then(performNextStep, rollbackDone);
      }

      if (isSaga(value)) {
        return Promise.resolve(value.do()).then((stepResult: unknown) => {
          undoables.push(value);

          return performNextStep(stepResult);
        }, rollbackDone);
      }

      return Promise.reject(new Error(`lil-saga only accepts yielded Promises, Sagas, and Arrays but got ${value}`));
    } catch (err) {
      return rollbackDone(err);
    }
  }

  return performNextStep();
}
