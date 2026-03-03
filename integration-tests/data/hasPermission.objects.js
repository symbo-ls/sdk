export const pageDataSets = {
  owner: {
    allowed: [
      'platformSettings',
      'showContent',
      'showCode',
      'editMode',
      'versions',
      'inviteMembers',
      'branchProtection',
      'projectSettings',
      'copyPasteAllowanceSetting',
      'iam'
    ],
    denied: []
  },
  admin: {
    allowed: [
      'platformSettings',
      'showContent',
      'showCode',
      'editMode',
      'versions',
      'inviteMembers',
      'branchProtection',
      'projectSettings'
    ],
    denied: ['copyPasteAllowanceSetting', 'iam']
  },
  editor: {
    allowed: [
      'platformSettings',
      'showContent',
      'showCode',
      'editMode',
      'versions'
    ],
    denied: [
      'copyPasteAllowanceSetting',
      'iam',
      'inviteMembers',
      'branchProtection',
      'projectSettings'
    ]
  },
  guest: {
    allowed: ['platformSettings', 'showContent'],
    denied: [
      'createProject',
      'showCode',
      'editMode',
      'versions',
      'inviteMembers',
      'branchProtection',
      'projectSettings',
      'copyPasteAllowanceSetting',
      'iam'
    ]
  }
}
