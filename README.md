# Lil' Saga

[npm-badge]: https://img.shields.io/npm/v/lil-saga.svg
[npm-badge-url]: https://www.npmjs.com/package/lil-saga
[travis-badge]: https://img.shields.io/travis/kturney/lil-saga/master.svg
[travis-badge-url]: https://travis-ci.org/kturney/lil-saga

[![Latest NPM release][npm-badge]][npm-badge-url]
[![TravisCI Build Status][travis-badge]][travis-badge-url]

`lil-saga` is a small library to assist in use of the [saga pattern](https://en.wikipedia.org/wiki/Long-running_transaction).

## Usage
`lil-saga` accepts a generator which may yield a `Saga`, a `Promise`, or an array containing a mix of `Saga`s and `Promise`s.

If an array is yielded, the actions (and any subsequent rollbacks), will be performed concurrently.

If an error occurs during execution, any previously executed `Saga`s will have their `undo` performed, in reverse order of execution.

## Example
```js
import lilSaga from 'lil-saga';

await lilSaga(function*() {
  let promiseYieldingFunctionResult = yield promiseYieldingFunction();

  let anotherPromiseYieldingFunctionResult = yield {
    do() {
      return anotherPromiseYieldingFunction();
    },

    undo() {
      return anotherPromiseYieldingFunctionReverse();
    }
  };

  let [
    thing1,
    thing2,
    thing3
  ] = yield [
    doThing1(),
    {
      do: () => doThing2(),
      undo: () => undoThing2()
    },
    doThing3()
  ];
});
```
