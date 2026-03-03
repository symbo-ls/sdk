import test from 'tape'

function subscribeTestPositive () {
  test('subscribe to project based collection with success', async tape => {
    const response = await globalSdk.subscribe(
      'db',
      {
        id: true,
        name: true,
        $list: {
          $sort: { $field: 'createdAt', $order: 'desc' },
          $find: {
            $traverse: 'children',
            $filter: [{ $field: 'type', $operator: '=', $value: 'project' }]
          }
        }
      },
      data => data
    )
    tape.ok(
      typeof response === 'function',
      'subscribed to project based collection with success'
    )
    response() // unsubscribe
  })
}

subscribeTestPositive()

test.onFinish(() => process.exit(0))
