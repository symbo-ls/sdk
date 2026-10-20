import test from 'tape'

// #region Negative Tests
test('meetArchiveRooms - throws when roomIds is missing', async t => {
    try {
        await global.globalSdk.meetArchiveRooms()
        t.fail('should have thrown error when called with no arguments')
    } catch (err) {
        t.equal(
            err.message,
            'roomIds must be an array',
            'throws "roomIds must be an array" when called without arguments'
        )
    }
})

test('meetArchiveRooms - throws when roomIds is not an array', async t => {
    try {
        await global.globalSdk.meetArchiveRooms({ roomIds: 'single-room-id', archived: true })
        t.fail('should have thrown error when roomIds is a string')
    } catch (err) {
        t.equal(
            err.message,
            'roomIds must be an array',
            'throws "roomIds must be an array" when roomIds is a string'
        )
    }
})

test('meetArchiveRooms - throws when roomIds is null', async t => {
    try {
        await global.globalSdk.meetArchiveRooms({ roomIds: null, archived: true })
        t.fail('should have thrown error when roomIds is null')
    } catch (err) {
        t.equal(
            err.message,
            'roomIds must be an array',
            'throws "roomIds must be an array" when roomIds is null'
        )
    }
})
// #endregion

test.onFinish(() => process.exit(0))