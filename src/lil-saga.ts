interface Undoable {
  undo(): any | Promise<any>;
}

interface Saga extends Undoable {
  do(): any | Promise<any>;
}

interface SagaGenerator {
  (): Iterator<
    Saga
    | Promise<any>
    | Array<Saga | Promise<any>>
  >
}

function isPromise(value: any): value is Promise<any> {
  return value && typeof value.then === 'function';
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
        try {
          const ret = undoable.undo();

          if (isPromise(ret)) {
            return ret.catch(this.onUndoError)
          }
        } catch (err) {
          this.onUndoError(err);
        }
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

export default function lilSaga(steps: SagaGenerator, { onUndoError = console.error.bind(console) }: LilSagaOptions = {}): Promise<void> {
  const undoables: Undoable[] = [];
  const iter = steps();

  const rollbackDone = (err: Error) => {
    return undoables
      .reduceRight((prev, undoable) => {
        return prev.then(() => {
          try {
            const undoResult = undoable.undo();

            if (isPromise(undoResult)) {
              return undoResult.catch(onUndoError);
            }
          } catch (err) {
            onUndoError(err);
          }

          return Promise.resolve();
        });
      }, Promise.resolve())
      .then(() => {
        throw err;
      });
  };

  function performConcurrentSteps(value: Array<Saga | Promise<any>>) {
    const concurrentUndoable = new ConcurrentUndoable(onUndoError);
    undoables.push(concurrentUndoable);

    function performConcurrentStep(
      concurrentStep: Saga | Promise<any>
    ): Promise<SettledValue<any> | SettledError> | SettledValue<any> | SettledError {
      if (isPromise(concurrentStep)) {
        return concurrentStep.then(valueToSettled, errToSettled);
      }

      try {
        const res = concurrentStep.do();

        if (isPromise(res)) {
          return res.then((stepResult: any) => {
            concurrentUndoable.items.push(concurrentStep);

            return new SettledValue(stepResult);
          }, errToSettled);
        }

        concurrentUndoable.items.push(concurrentStep);
        return new SettledValue(res);
      } catch (err) {
        return new SettledError(err);
      }
    }

    function settledToResults(settleds: Array<SettledValue<any> | SettledError>) {
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

  function performNextStep(preStepResult?: any): Promise<void> {
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

      return value.do().then((stepResult: any) => {
        undoables.push(value);

        return performNextStep(stepResult);
      }, rollbackDone);
    } catch (err) {
      return rollbackDone(err);
    }
  }

  return performNextStep();
}
