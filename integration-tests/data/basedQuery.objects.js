export const negativeDataSets = {
  functionNotFound: {
    collection: 'users',
    query: {},
    options: {},
    title: 'Query failed: Function not found',
    error: 'Query failed: [users] Function not found.'
  },
  wrongFunctionType: {
    collection: 'users:get-by',
    query: {},
    options: {},
    title: 'Query failed: Target function is of wrong type',
    error: 'Query failed: [users:get-by] Target function is of wrong type.'
  }
}
