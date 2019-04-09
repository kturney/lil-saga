import { script } from 'lab';
import { expect } from 'code';
import lilSaga from '../../src/lil-saga';

const lab = script();
const { describe, it, before } = lab;
export { lab };

describe('lil-saga', () => {
  it('returns results correctly', async () => {
    await lilSaga(function*() {
      const res1 = yield Promise.resolve('res1');

      expect(res1, 'res1').to.equal('res1');

      const promiseArrayResults = yield [
        Promise.resolve('promiseArrayResults1'),
        Promise.resolve('promiseArrayResults2'),
        Promise.resolve('promiseArrayResults3')
      ];

      expect(promiseArrayResults, 'promiseArrayResults').to.equal([
        'promiseArrayResults1',
        'promiseArrayResults2',
        'promiseArrayResults3'
      ]);

      const sagaRes1 = yield {
        do() {
          return Promise.resolve('sagaRes1');
        },

        undo() {}
      };

      expect(sagaRes1, 'sagaRes1').to.equal('sagaRes1');

      const sagaResults = yield [
        {
          do() {
            return Promise.resolve('sagaResults1');
          },

          undo() {}
        },
        {
          do() {
            return Promise.resolve('sagaResults2');
          },

          undo() {}
        },
        {
          do() {
            return Promise.resolve('sagaResults3');
          },

          undo() {}
        }
      ];

      expect(sagaResults, 'sagaResults').to.equal([
        'sagaResults1',
        'sagaResults2',
        'sagaResults3'
      ]);
    });
  });

  it('undoes on error', async () => {
    const steps = [];

    const saga = lilSaga(function*() {
      yield {
        do() {
          steps.push('do1');
          return Promise.resolve('do1');
        },

        undo() {
          steps.push('undo1');
        }
      };

      yield [
        {
          do() {
            steps.push('doConcurrent1');
            return Promise.resolve('doConcurrent1');
          },

          undo() {
            steps.push('undoConcurrent1');
          }
        },
        {
          do() {
            steps.push('doConcurrent2');
            return Promise.resolve('doConcurrent2');
          },

          undo() {
            steps.push('undoConcurrent2');
          }
        },
        {
          do() {
            steps.push('doConcurrent3');
            return Promise.resolve('doConcurrent3');
          },

          undo() {
            steps.push('undoConcurrent3');
          }
        }
      ];

      yield {
        do() {
          steps.push('do2');
          return Promise.reject(new Error('test error'));
        },

        undo() {
          steps.push('undo2');
        }
      };

      yield {
        do() {
          steps.push('should not get here');
          return Promise.resolve('should not get here');
        },

        undo() {
          steps.push('should not get here');
        }
      };
    });

    await expect(saga).to.reject(Error, 'test error');

    expect(steps, 'steps').to.equal([
      'do1',
      'doConcurrent1',
      'doConcurrent2',
      'doConcurrent3',
      'do2',
      'undoConcurrent1',
      'undoConcurrent2',
      'undoConcurrent3',
      'undo1'
    ]);
  });

  it('undoes after error thrown in the generator', async () => {
    const steps = [];

    const saga = lilSaga(function*() {
      yield {
        do() {
          steps.push('do1');
          return Promise.resolve('do1');
        },

        undo() {
          steps.push('undo1');
        }
      };

      steps.push('did');
      throw new Error('test error');
      steps.push('should not get here');
    });

    await expect(saga).to.reject(Error, 'test error');

    expect(steps, 'steps').to.equal([
      'do1',
      'did',
      'undo1'
    ]);
  });

  it('undoes after error thrown in Saga', async () => {
    const steps = [];

    const saga = lilSaga(function*() {
      yield {
        do() {
          steps.push('do1');
          return Promise.resolve('do1');
        },

        undo() {
          steps.push('undo1');
        }
      };

      yield {
        do() {
          steps.push('do2');
          throw new Error('test error');
        },

        undo() {
          steps.push('undo2');
        }
      };

      steps.push('should not get here');
    });

    await expect(saga).to.reject(Error, 'test error');

    expect(steps, 'steps').to.equal([
      'do1',
      'do2',
      'undo1'
    ]);
  });

  it('ignores errors that ocurr during undo', async () => {
    const steps = [];

    const saga = lilSaga(function*() {
      yield {
        do() {
          steps.push('do1');
          return Promise.resolve('do1');
        },

        undo() {
          steps.push('undo1');
        }
      };

      yield {
        do() {
          steps.push('do2');
          return Promise.resolve('do2');
        },

        undo() {
          steps.push('undo2');
          throw new Error('error during undo');
        }
      };

      throw new Error('test error');
      steps.push('should not get here');
    }, { onUndoError: () => {} });

    await expect(saga).to.reject(Error, 'test error');

    expect(steps, 'steps').to.equal([
      'do1',
      'do2',
      'undo2',
      'undo1'
    ]);
  });

  it('undoes after error during concurrent', async () => {
    const steps = [];

    const saga = lilSaga(function*() {
      yield {
        do() {
          steps.push('do1');
          return Promise.resolve('do1');
        },

        undo() {
          steps.push('undo1');
        }
      };

      yield [
        {
          do() {
            steps.push('do2');
            return Promise.resolve('do2');
          },

          undo() {
            steps.push('undo2');
            return Promise.resolve('undo2')
          }
        },
        {
          do() {
            steps.push('do3');
            throw new Error('test error 1');
          },

          undo() {
            steps.push('undo3');
          }
        },
        {
          do() {
            steps.push('do4');
            return Promise.resolve('do4');
          },

          undo() {
            steps.push('undo4');
            throw new Error('error during undo2');
          }
        },
        {
          do() {
            steps.push('do5');
          },

          undo() {
            steps.push('undo5');
          }
        },
        {
          do() {
            steps.push('do6');
            return Promise.reject(new Error('test error 2'));
          },

          undo() {
            steps.push('undo6');
          }
        }
      ];

      steps.push('should not get here');
    }, { onUndoError: () => {} });

    await expect(saga).to.reject(Error, 'test error 1');

    expect(steps, 'steps').to.equal([
      'do1',
      'do2',
      'do3',
      'do4',
      'do5',
      'do6',
      'undo5',
      'undo2',
      'undo4',
      'undo1'
    ]);
  });

  it('handles bad yields', async function() {
    await lilSaga(function*() {
      yield null;
    }).then(
      () => {
        throw new Error('should not get here');
      },
      (err) => {
        expect(err.message).to.equal('lil-saga only accepts yielded Promises, Sagas, and Arrays but got null')
      }
    );

    await lilSaga(function*() {
      yield [null];
    }).then(
      () => {
        throw new Error('should not get here');
      },
      (err) => {
        expect(err.message).to.equal('lil-saga concurrent steps must be either a Promise or a Saga, was null')
      }
    );
  });
});
