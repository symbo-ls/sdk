import test from 'tape'

// #region Negative Tests
const negativeDataSet = {
    missingRoomIds: {
        title: 'missing',
        testParams: undefined,
        expectedFailError: 'called with no arguments',
        assertionError: 'called without arguments'
    },
    notAnArray: {
        title: 'not an array',
        testParams: { roomIds: 'single-room-id', archived: true },
        expectedFailError: 'roomIds is a string',
        assertionError: 'roomIds is a string'
    },
    isNull: {
        title: 'null',
        testParams: { roomIds: null, archived: true },
        expectedFailError: 'roomIds is null',
        assertionError: 'roomIds is null'
    }
}
Object.keys(negativeDataSet).forEach(key => {
    const dataSet = negativeDataSet[key]
    console.log(`dataSet.title: ${ dataSet.title }`)
    test(`meetArchiveRooms - throws when roomIds is ${ dataSet.title }`, async t => {
        try {
            await global.globalSdk.meetArchiveRooms(dataSet.testParams)
            t.fail(`should have thrown error when ${ dataSet.expectedFailError }`)
        } catch (err) {
            t.equal(
                err.message,
                'roomIds must be an array',
                `throws "roomIds must be an array" when ${dataSet.assertionError}`
            )
        }
    })
})
// #endregion

test.onFinish(() => process.exit(0))