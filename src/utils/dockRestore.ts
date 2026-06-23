export type DockRestoreDecision = 'wait' | 'mount' | 'stop';

export interface DockRestoreState {
    lifecycleCurrent: boolean;
    elementReady: boolean;
    elementConnected?: boolean;
    mounted: boolean;
    hasSidebarRoot?: boolean;
    buttonActive?: boolean;
    panelVisible?: boolean;
}

export function getDockRestoreDecision(state: DockRestoreState): DockRestoreDecision {
    if (!state.lifecycleCurrent) return 'stop';
    if (state.mounted && state.hasSidebarRoot !== false) return 'stop';
    if (!state.elementReady) return 'wait';
    if (state.elementConnected === false) return 'wait';
    if (state.hasSidebarRoot === false) return 'mount';
    return state.buttonActive || state.panelVisible ? 'mount' : 'wait';
}
