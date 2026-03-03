import test from 'tape'
import { negativeDataSets } from './data/basedQuery.objects.js'

function queryTestNegative (dataSet) {
  test(`query ${dataSet.title}`, async tape => {
    try {
      await globalSdk.query(dataSet.collection, dataSet.query, dataSet.options)
    } catch (error) {
      tape.equal(error.message, dataSet.error, dataSet.error)
    }
  })
}

function queryTestPositive () {
  test('query executed with success', async tape => {
    const response = await globalSdk.query('db', {
      $all: true,
      password: false,
      $find: {
        $traverse: 'descendants',
        $filter: {
          $field: 'email',
          $operator: '=',
          $value: globalUser.email
        }
      }
    })
    tape.ok(response)
    tape.equal(response.email, globalUser.email, 'email matches queried user')
    tape.equal(response.type, globalUser.type, 'type is user')
    tape.equal(response.id, globalUser.userId, 'id matches queried user')
    tape.equal(response.name, globalUser.name, 'user name matches queries user')
  })
}

Object.keys(negativeDataSets).forEach(key => {
  const dataSet = negativeDataSets[key]
  queryTestNegative(dataSet)
})

queryTestPositive()

test.onFinish(() => process.exit(0))
