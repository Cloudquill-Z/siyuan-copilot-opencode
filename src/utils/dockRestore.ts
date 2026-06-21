export type DockRestoreDecision = 'wait' | 'mount' | 'stop';

export interface DockRestoreState {
    lifecycleCurrent: boolean;
    elementReady: boolean;
    mounted: boolean;
    buttonActive?: boolean;
    panelVisible?: boolean;
}

export function getDockRestoreDecision(state: DockRestoreState): DockRestoreDecision {
    if (!state.lifecycleCurrent || state.mounted) return 'stop';
    if (!state.elementReady) return 'wait';
    return state.buttonActive || state.panelVisible ? 'mount' : 'wait';
}
