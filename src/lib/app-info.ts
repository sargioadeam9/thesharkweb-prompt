export const APP_NAME = 'TheSharkWebPrompt'

// __APP_VERSION__ comes from vite.config `define`. The guard keeps the app
// alive if it is ever served without that config.
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

export const APP_LICENSE = 'MIT'
