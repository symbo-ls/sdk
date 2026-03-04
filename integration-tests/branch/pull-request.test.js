import test from 'tape'

const pullRequestData = {
  source: 'test-source',
  target: 'test-target',
  title: 'test-title'
}

const reviewData = {
  status: 'feedback',
  threads: [
    {
      path: [
        'components',
        'text'
      ],
      comments: ['test feedback']
    }
  ]
}

test('create pull request', async tape => {
  await setup()
  const response = await global.globalSdk.createPullRequest(global.globalProject.id, pullRequestData)
  tape.equal(response.source, pullRequestData.source, 'source matches')
  tape.equal(response.target, pullRequestData.target, 'target matches')
  tape.equal(response.title, pullRequestData.title, 'title matches')
  tape.equal(response.status, 'open', 'request open')
  await teardown()
})

test('list pull requests', async tape => {
  await setup()
  const pullID = await createPR()
  const response = await global.globalSdk.listPullRequests(global.globalProject.id)
  tape.ok(response)
  const foundPR = response.prs.filter((pr) => (pr.id.includes(pullID)))
  tape.ok(foundPR)
  await teardown()
})

test('get pull request', async tape => {
  await setup()
  const pullID = await createPR()
  const response = await global.globalSdk.getPullRequest(global.globalProject.id, pullID)
  tape.equal(response.id, pullID, 'PR found')
  tape.equal(response.canMerge, false, 'PR not approved yet')
  await teardown()
})

test('review pull request', async tape => {
  await setup()
  const pullID = await createPR()
  const response = await global.globalSdk.reviewPullRequest(global.globalProject.id, pullID, reviewData)
  tape.equal(response.message, 'Review submitted successfully', 'Review submitted successfully')
  await teardown()
})

test('add pull request comment', async tape => {
  await setup()
  const pullID = await createPR()
  let response = await global.globalSdk.reviewPullRequest(global.globalProject.id, pullID, reviewData)
  tape.equal(response.message, 'Review submitted successfully', 'Review submitted successfully')
  const commentData = {
    reviewIndex: 0,
    path: [
      'components',
      'text'
    ],
    value: 'test comment'
  }
  response = await global.globalSdk.addPullRequestComment(global.globalProject.id, pullID, commentData)
  tape.equal(response.message, 'Comment added successfully', 'Comment added successfully')
  await teardown()
})

test('approve pull request', async tape => {
  await setup()
  const pullID = await createPR()
  const reviewData = { status: 'approved' }
  let response = await global.globalSdk.reviewPullRequest(global.globalProject.id, pullID, reviewData)
  tape.equal(response.message, 'Review submitted successfully', 'Review submitted successfully')
  response = await global.globalSdk.getPullRequest(global.globalProject.id, pullID)
  tape.equal(response.canMerge, true, 'PR approved')
  await teardown()
})

test('get pull request diff', async tape => {
  await setup()
  const pullID = await createPR()
  const response = await global.globalSdk.getPullRequestDiff(global.globalProject.id, pullID)
  tape.equal(response.conflicts.length, 0, 'no conflicts')
  tape.equal(response.sourceDiffs.length, 0, 'no sourceDiffs')
  tape.equal(response.targetDiffs.length, 0, 'no targetDiffs')
  await teardown()
})

test('merge pull request', async tape => {
  await setup()
  const pullID = await createPR()
  const reviewData = { status: 'approved' }
  await global.globalSdk.reviewPullRequest(global.globalProject.id, pullID, reviewData)
  const response = await global.globalSdk.mergePullRequest(global.globalProject.id, pullID)
  tape.equal(response.success, true, 'PR merged')
  await teardown()
})

async function setup () {
  await global.globalSdk.createBranchWithValidation(global.globalProject.id, pullRequestData.target)
  await global.globalSdk.createBranchWithValidation(global.globalProject.id, pullRequestData.source)
  await global.globalSdk.updateProjectComponents(global.globalProject.id, {
    text: 'test text'
  })
}

async function createPR () {
  const response = await global.globalSdk.createPullRequest(global.globalProject.id, pullRequestData)
  return response.id
}

async function teardown () {
  await global.globalSdk.deleteBranch(global.globalProject.id, pullRequestData.source)
  await global.globalSdk.deleteBranch(global.globalProject.id, pullRequestData.target)
}

test.onFailure(async () => {
  await teardown()
})

test.onFinish(() => {
  process.exit(0)
})
