export const pageDataSets = {
  pageContent: {
    add: {
      key: '/page-1',
      value: {
        title: 'Page 1',
        Header: {},
        Body: {},
        Footer: {}
      },
      schema: {
        key: '/page-1',
        type: 'Page',
        code: '...',
        uses: ['Flex'],
        settings: {
          gridOptions: {
            x: 0,
            y: 0,
            w: 3,
            h: 2
          }
        },
        description: ''
      }
    },
    update: {
      key: '/page-2',
      value: {
        title: 'Page 2',
        Header: {},
        Body: {},
        Footer: {}
      },
      schema: {
        key: '/page-2',
        type: 'Page',
        code: '...',
        uses: ['Flex'],
        settings: {
          gridOptions: {
            x: 0,
            y: 0,
            w: 3,
            h: 2
          }
        },
        description: ''
      }
    },
    delete: {
      key: '/page-3',
      value: {
        title: 'Page 3',
        Header: {},
        Body: {},
        Footer: {}
      },
      schema: {
        key: '/page-3',
        type: 'Page',
        code: '...',
        uses: ['Flex'],
        settings: {
          gridOptions: {
            x: 0,
            y: 0,
            w: 3,
            h: 2
          }
        },
        description: ''
      }
    }
  },
  canvasContent: {
    addCanvas: [
      [
        'update',
        ['canvas', 'pages', 'Test Canvas Title'],
        {
          title: 'Test Canvas Title',
          freeform: true,
          pages: [],
          components: [],
          functions: [],
          methods: [],
          snippets: [],
          atom: [],
          files: [],
          dependencies: [],
          secrets: []
        }
      ]
    ]
  }
}
