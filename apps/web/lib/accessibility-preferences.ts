export const ACCESSIBILITY_STORAGE_KEY = 'evolvia.accessibility';

export const TEXT_SCALES = ['100', '125', '150'] as const;
export const TEXT_SPACING = ['default', 'wide'] as const;

export type AccessibilityTextScale = (typeof TEXT_SCALES)[number];
export type AccessibilityTextSpacing = (typeof TEXT_SPACING)[number];

export type AccessibilityPreferences = {
  text: AccessibilityTextScale;
  spacing: AccessibilityTextSpacing;
  font: 'default' | 'readable';
  contrast: 'system' | 'high' | 'off';
  links: 'off' | 'on';
  motion: 'system' | 'reduce';
  focus: 'default' | 'strong';
  targets: 'default' | 'large';
};

export const DEFAULT_ACCESSIBILITY_PREFERENCES: AccessibilityPreferences = {
  text: '100',
  spacing: 'default',
  font: 'default',
  contrast: 'system',
  links: 'off',
  motion: 'system',
  focus: 'default',
  targets: 'default',
};

const ATTRIBUTE_NAMES = [
  'data-a11y-text',
  'data-a11y-spacing',
  'data-a11y-font',
  'data-a11y-contrast',
  'data-a11y-links',
  'data-a11y-motion',
  'data-a11y-focus',
  'data-a11y-targets',
] as const;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

export function parseAccessibilityPreferences(raw: string | null): AccessibilityPreferences {
  if (!raw) return { ...DEFAULT_ACCESSIBILITY_PREFERENCES };
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ...DEFAULT_ACCESSIBILITY_PREFERENCES };
    return {
      text: oneOf(data.text, TEXT_SCALES, '100'),
      spacing: oneOf(data.spacing, TEXT_SPACING, 'default'),
      font: oneOf(data.font, ['default', 'readable'] as const, 'default'),
      contrast: oneOf(data.contrast, ['system', 'high', 'off'] as const, 'system'),
      links: oneOf(data.links, ['off', 'on'] as const, 'off'),
      motion: oneOf(data.motion, ['system', 'reduce'] as const, 'system'),
      focus: oneOf(data.focus, ['default', 'strong'] as const, 'default'),
      targets: oneOf(data.targets, ['default', 'large'] as const, 'default'),
    };
  } catch {
    return { ...DEFAULT_ACCESSIBILITY_PREFERENCES };
  }
}

export function accessibilityAttributes(preferences: AccessibilityPreferences): Array<[string, string | null]> {
  return [
    ['data-a11y-text', preferences.text === '100' ? null : preferences.text],
    ['data-a11y-spacing', preferences.spacing === 'default' ? null : preferences.spacing],
    ['data-a11y-font', preferences.font === 'readable' ? 'readable' : null],
    ['data-a11y-contrast', preferences.contrast === 'system' ? null : preferences.contrast],
    ['data-a11y-links', preferences.links === 'on' ? 'on' : null],
    ['data-a11y-motion', preferences.motion === 'reduce' ? 'reduce' : null],
    ['data-a11y-focus', preferences.focus === 'strong' ? 'strong' : null],
    ['data-a11y-targets', preferences.targets === 'large' ? 'large' : null],
  ];
}

export function applyAccessibilityPreferences(root: HTMLElement, preferences: AccessibilityPreferences): void {
  for (const [name, value] of accessibilityAttributes(preferences)) {
    if (value) root.setAttribute(name, value);
    else root.removeAttribute(name);
  }
}

export const ACCESSIBILITY_BOOT_SCRIPT = `(function(){try{var raw=localStorage.getItem(${JSON.stringify(ACCESSIBILITY_STORAGE_KEY)});if(!raw)return;var data=JSON.parse(raw);if(!data||typeof data!=="object")return;var root=document.documentElement;var text={ "100":"100","125":"125","150":"150" };if(text[data.text]&&data.text!=="100")root.setAttribute("data-a11y-text",text[data.text]);if(data.spacing==="wide")root.setAttribute("data-a11y-spacing","wide");if(data.font==="readable")root.setAttribute("data-a11y-font","readable");if(data.contrast==="high"||data.contrast==="off")root.setAttribute("data-a11y-contrast",data.contrast);if(data.links==="on")root.setAttribute("data-a11y-links","on");if(data.motion==="reduce")root.setAttribute("data-a11y-motion","reduce");if(data.focus==="strong")root.setAttribute("data-a11y-focus","strong");if(data.targets==="large")root.setAttribute("data-a11y-targets","large");}catch(e){}})();`;

export function accessibilityAttributeNames(): readonly string[] {
  return ATTRIBUTE_NAMES;
}
