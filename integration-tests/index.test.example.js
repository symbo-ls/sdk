import tape from 'tape'
import sinon from 'sinon'
import proxyquire from 'proxyquire'

const symstoryMock = {
  update: sinon.spy(),
  delete: sinon.spy()
}

const globalSdk = proxyquire('../globalSdk.js', {
  '../../symstory': symstoryMock
}).default

function createglobalSdkInstance () {
  return globalSdk.call({
    getDesignSystem: sinon.stub().returns({
      color: { blue: '#0000FF', red: '#FF0000' }
    }),
    getData: sinon.stub().returns({
      user: { name: 'John', age: 30 }
    }),
    call: sinon.stub().returns(false),
    prepareDataItem: sinon.stub().returnsArg(0),
    prepareSchemaItem: sinon.stub().returnsArg(0),
    setItem: sinon.spy()
  })
}

tape('globalSdk.get - should fetch values from design system', t => {
  const globalSdkInstance = createglobalSdkInstance()
  const result = globalSdkInstance.get('color', 'blue')

  t.equal(
    result,
    '#0000FF',
    'Should return the correct value from design system'
  )
  t.end()
})

tape('globalSdk.get - should fetch values from data store', t => {
  const globalSdkInstance = createglobalSdkInstance()
  const result = globalSdkInstance.get('user', 'name')

  t.equal(result, 'John', 'Should return the correct value from data')
  t.end()
})

tape('globalSdk.getAll - should return filtered object by keyword', t => {
  const globalSdkInstance = createglobalSdkInstance()
  const result = globalSdkInstance.getAll('color', {
    filters: { keyword: 'blue' }
  })

  t.deepEqual(result, { blue: '#0000FF' }, 'Should return the filtered object')
  t.end()
})

tape('globalSdk.getAll - should return as array if opts.as is array', t => {
  const globalSdkInstance = createglobalSdkInstance()
  const result = globalSdkInstance.getAll('color', { as: 'array' })

  t.deepEqual(
    result,
    [
      { key: 'blue', value: '#0000FF' },
      { key: 'red', value: '#FF0000' }
    ],
    'Should return the object as an array'
  )
  t.end()
})

tape('globalSdk.set - should update symstory and call setItem', t => {
  const globalSdkInstance = createglobalSdkInstance()
  globalSdkInstance.set('color', 'green', '#00FF00')

  t.ok(
    symstoryMock.update.calledWith(['color', 'green'], '#00FF00'),
    'Should update symstory with correct data'
  )
  t.ok(
    symstoryMock.update.calledWith(['schema', 'color', 'green'], '#00FF00'),
    'Should update schema in symstory'
  )
  t.end()
})

tape('globalSdk.delete - should delete from symstory', t => {
  const globalSdkInstance = createglobalSdkInstance()
  globalSdkInstance.delete('color', 'blue')

  t.ok(
    symstoryMock.delete.calledWith(['color', 'blue']),
    'Should delete the item from symstory'
  )
  t.ok(
    symstoryMock.delete.calledWith(['schema', 'color', 'blue']),
    'Should delete the schema from symstory'
  )
  t.end()
})
