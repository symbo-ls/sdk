// deprecated
export const buildProjectQuery = projectId => ({
  $id: projectId,
  $all: true,
  createdAt: true,
  updatedAt: true,
  package: true,
  schema: true,
  bucket: true,
  settings: true,
  tier: true,
  members: {
    $list: { $inherit: true },
    id: true,
    name: true,
    username: true,
    email: true,
    state: true,
    roles: {
      $list: { $inherit: true },
      $all: true
    }
  },
  users: {
    $list: { $inherit: true },
    $all: true
  }
})

// deprecated
export const buildUserQuery = userId => ({
  $id: userId,
  name: true,
  username: true,
  email: true,
  state: true,
  roles: {
    $list: { $inherit: true },
    $all: true
  }
})

export const buildGetUserDataQuery = userId => ({
  $id: userId,
  id: true,
  name: true,
  email: true,
  username: true,
  globalRole: true,
  updatedAt: true,
  createdAt: true,
  memberProjects: {
    $list: true,
    id: true,
    role: true,
    createdAt: true,
    updatedAt: true,
    project: {
      id: true,
      key: true,
      name: true,
      thumbnail: true,
      icon: true,
      tier: true,
      visibility: true,
      access: true,
      members: {
        $list: true,
        user: {
          id: true,
          name: true,
          email: true,
          globalRole: true
        },
        role: true,
        updatedAt: true,
        createdAt: true
      }
    }
  }
})

export const buildGetProjectsByKeysQuery = keys => (
  {
    projects: {
      id: true,
      key: true,
      name: true,
      thumbnail: true,
      icon: true,
      tier: true,
      visibility: true,
      access: true,
      members: {
        $list: true,
        user: {
          id: true,
          name: true,
          email: true,
          globalRole: true
        },
        role: true,
        updatedAt: true,
        createdAt: true
      },
      $list: {
        $find: {
          $traverse: "children",
          $filter: [
            { $field: "type", $operator: "=", $value: "project" },
            { $field: "key", $operator: "=", $value: keys }
          ]
        }
      }
    }
  }
)

const GetProjectFields = {
  id: true,
  name: true,
  key: true,
  tier: true,
  projectType: true,
  icon: true,
  package: true,
  seats: true,
  projectPassword: true,
  stripe: true,
  payments:{
    $list: true,
    id: true,
    name: true
  },
  access: true,
  isSharedLibrary: true,
  framework: true,
  designTool: true,
  language: true,
  visibility: true,
  domains: true,
  subscription:{id: true},
  members: {
    $list: true,
    user: {id: true, name: true, email: true},
    role: true,
  }
}

export const buildGetProjectDataQuery = projectId => ({
  $id: projectId,
  ...GetProjectFields
})

export const buildGetProjectByKeyDataQuery = key => ({
  ...GetProjectFields,
  $find: {
    $traverse: 'children',
    $filter: [
      { $field: 'type', $operator: '=', $value: 'project' },
      { $field: 'key', $operator: '=', $value: key }
    ]
  }
})