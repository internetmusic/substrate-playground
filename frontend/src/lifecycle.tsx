import { assign, Machine } from 'xstate';
import { useMachine } from '@xstate/react';
import { Client, PlaygroundUser, Template } from '@substrate/playground-client';
import { approve, approved } from './terms';

export enum PanelId {Session, Admin, Stats, Theia}
export interface Params {
    deploy?: string,
}

export interface Context {
  panel: PanelId,
  user?: PlaygroundUser,
  templates?: Record<string, Template>,
}

export enum States {
    TERMS_UNAPPROVED = '@state/TERMS_UNAPPROVED',
    SETUP = '@state/SETUP',
    LOGGED = '@state/LOGGED',
    UNLOGGED = '@state/UNLOGGED',
    UNLOGGING = '@state/UNLOGGING',
}

export enum Events {
    TERMS_APPROVAL = '@event/TERMS_APPROVAL',
    LOGIN = '@action/LOGIN',
    SELECT = '@action/SELECT',
    RESTART = '@action/RESTART',
    UNLOGIN = '@action/UNLOGIN',
    LOGOUT = '@action/LOGOUT',
}

export enum Actions {
    STORE_TERMS_HASH = '@action/STORE_TERMS_HASH',
}

function lifecycle(client: Client, id: PanelId) {
  return Machine<Context>({
    initial: approved()? States.SETUP: States.TERMS_UNAPPROVED,
    context: {
        panel: id,
    },
    states: {
        [States.TERMS_UNAPPROVED]: {
            on: {
                [Events.TERMS_APPROVAL]:
                    {target: States.SETUP,
                     actions: [Actions.STORE_TERMS_HASH]},
            }
        },
        [States.SETUP]: {
            invoke: {
                src: () => async (callback) => {
                    try {
                        const { templates, user } = (await client.get());
                        if (user) {
                            callback({type: Events.LOGIN, templates: templates, user: user});
                        } else {
                            callback({type: Events.UNLOGIN, templates: templates});
                        }
                    } catch {
                        callback({type: Events.UNLOGIN});
                    }
                },
            },
            on: {[Events.LOGIN]: {target: States.LOGGED,
                                  actions: assign((_, event) => {
                                    return {
                                      templates: event.templates,
                                      user: event.user,
                                    }
                                  })},
                 [Events.UNLOGIN]: {target: States.UNLOGGED,
                                    actions: assign((_, event) => {
                                      return {
                                        templates: event.templates,
                                        user: null,
                                      }
                                    })}}
        },
        [States.UNLOGGED]: {
            on: {[Events.RESTART]: States.SETUP,}
        },
        [States.LOGGED]: {
            on: {[Events.RESTART]: States.SETUP,
                 [Events.LOGOUT]: {target: States.UNLOGGING},
                 [Events.SELECT]: {actions: assign({ panel: (_, event) => event.panel})}}
        },
        [States.UNLOGGING]: {
            invoke: {
                src: async () => {
                    await client.logout();
                },
                onDone: {target: States.SETUP}
            }
        },
    }
  },
  {
    actions: {
      [Actions.STORE_TERMS_HASH]: () => {
        approve();
      },
    }
  });
}

export function useLifecycle(client: Client, id: PanelId) {
    return useMachine(lifecycle(client, id), { devTools: true });
}
