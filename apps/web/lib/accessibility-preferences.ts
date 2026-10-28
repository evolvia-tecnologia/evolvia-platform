export const ACCESSIBILITY_STORAGE_KEY = 'evolvia.accessibility';

export const TEXT_SCALES = ['85', '100', '125', '150'] as const;
export const TEXT_SPACING = ['default', 'wide'] as const;

export type AccessibilityTextScale = (typeof TEXT_SCALES)[number];
export type AccessibilityTextSpacing = (typeof TEXT_SPACING)[number];
export type AccessibilityProfile = 'low-vision' | 'dyslexia' | 'reading' | 'calm';

export type AccessibilityPreferences = {
  text: AccessibilityTextScale;
  spacing: AccessibilityTextSpacing;
  letters: AccessibilityTextSpacing;
  lines: AccessibilityTextSpacing;
  font: 'default' | 'readable' | 'dyslexia';
  contrast: 'system' | 'high' | 'off';
  links: 'off' | 'on';
  motion: 'system' | 'reduce';
  focus: 'default' | 'strong';
  targets: 'default' | 'large';
  reading: 'off' | 'on';
  cursor: 'default' | 'large' | 'bold';
  images: 'show' | 'hide';
  colors: 'system' | 'invert';
  sound: 'system' | 'off';
  clickSpeak: 'off' | 'on';
  guideBar: 'off' | 'on';
  guideMask: 'off' | 'on';
};

export const DEFAULT_ACCESSIBILITY_PREFERENCES: AccessibilityPreferences = {
  text: '100',
  spacing: 'default',
  letters: 'default',
  lines: 'default',
  font: 'default',
  contrast: 'system',
  links: 'off',
  motion: 'system',
  focus: 'default',
  targets: 'default',
  reading: 'off',
  cursor: 'default',
  images: 'show',
  colors: 'system',
  sound: 'system',
  clickSpeak: 'off',
  guideBar: 'off',
  guideMask: 'off',
};

const ATTRIBUTE_NAMES = [
  'data-a11y-text',
  'data-a11y-spacing',
  'data-a11y-letters',
  'data-a11y-lines',
  'data-a11y-font',
  'data-a11y-contrast',
  'data-a11y-links',
  'data-a11y-motion',
  'data-a11y-focus',
  'data-a11y-targets',
  'data-a11y-reading',
  'data-a11y-cursor',
  'data-a11y-images',
  'data-a11y-colors',
  'data-a11y-sound',
  'data-a11y-click',
  'data-a11y-guide-bar',
  'data-a11y-guide-mask',
] as const;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

function axis(data: Record<string, unknown>, key: 'letters' | 'lines'): AccessibilityTextSpacing {
  if (Object.prototype.hasOwnProperty.call(data, key)) return oneOf(data[key], TEXT_SPACING, 'default');
  return data.spacing === 'wide' ? 'wide' : 'default';
}

export function finalizeAccessibilityPreferences(preferences: AccessibilityPreferences): AccessibilityPreferences {
  return {
    ...preferences,
    spacing: preferences.letters === 'wide' && preferences.lines === 'wide' ? 'wide' : 'default',
  };
}

export function parseAccessibilityPreferences(raw: string | null): AccessibilityPreferences {
  if (!raw) return { ...DEFAULT_ACCESSIBILITY_PREFERENCES };
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ...DEFAULT_ACCESSIBILITY_PREFERENCES };
    return finalizeAccessibilityPreferences({
      text: oneOf(data.text, TEXT_SCALES, '100'),
      spacing: 'default',
      letters: axis(data, 'letters'),
      lines: axis(data, 'lines'),
      font: oneOf(data.font, ['default', 'readable', 'dyslexia'] as const, 'default'),
      contrast: oneOf(data.contrast, ['system', 'high', 'off'] as const, 'system'),
      links: oneOf(data.links, ['off', 'on'] as const, 'off'),
      motion: oneOf(data.motion, ['system', 'reduce'] as const, 'system'),
      focus: oneOf(data.focus, ['default', 'strong'] as const, 'default'),
      targets: oneOf(data.targets, ['default', 'large'] as const, 'default'),
      reading: oneOf(data.reading, ['off', 'on'] as const, 'off'),
      cursor: oneOf(data.cursor, ['default', 'large', 'bold'] as const, 'default'),
      images: oneOf(data.images, ['show', 'hide'] as const, 'show'),
      colors: oneOf(data.colors, ['system', 'invert'] as const, 'system'),
      sound: oneOf(data.sound, ['system', 'off'] as const, 'system'),
      clickSpeak: oneOf(data.clickSpeak, ['off', 'on'] as const, 'off'),
      guideBar: oneOf(data.guideBar, ['off', 'on'] as const, 'off'),
      guideMask: oneOf(data.guideMask, ['off', 'on'] as const, 'off'),
    });
  } catch {
    return { ...DEFAULT_ACCESSIBILITY_PREFERENCES };
  }
}

export function preferencesForProfile(profile: AccessibilityProfile): AccessibilityPreferences {
  const next: AccessibilityPreferences = { ...DEFAULT_ACCESSIBILITY_PREFERENCES };
  if (profile === 'low-vision') {
    next.text = '150';
    next.contrast = 'high';
    next.focus = 'strong';
    next.targets = 'large';
    next.cursor = 'large';
    next.links = 'on';
  } else if (profile === 'dyslexia') {
    next.font = 'dyslexia';
    next.letters = 'wide';
    next.lines = 'wide';
    next.reading = 'on';
  } else if (profile === 'reading') {
    next.reading = 'on';
    next.lines = 'wide';
    next.guideBar = 'on';
  } else {
    next.motion = 'reduce';
    next.sound = 'off';
  }
  return finalizeAccessibilityPreferences(next);
}

export function accessibilityAttributes(preferences: AccessibilityPreferences): Array<[string, string | null]> {
  return [
    ['data-a11y-text', preferences.text === '100' ? null : preferences.text],
    ['data-a11y-spacing', null],
    ['data-a11y-letters', preferences.letters === 'wide' ? 'wide' : null],
    ['data-a11y-lines', preferences.lines === 'wide' ? 'wide' : null],
    ['data-a11y-font', preferences.font === 'default' ? null : preferences.font],
    ['data-a11y-contrast', preferences.contrast === 'system' ? null : preferences.contrast],
    ['data-a11y-links', preferences.links === 'on' ? 'on' : null],
    ['data-a11y-motion', preferences.motion === 'reduce' ? 'reduce' : null],
    ['data-a11y-focus', preferences.focus === 'strong' ? 'strong' : null],
    ['data-a11y-targets', preferences.targets === 'large' ? 'large' : null],
    ['data-a11y-reading', preferences.reading === 'on' ? 'on' : null],
    ['data-a11y-cursor', preferences.cursor === 'default' ? null : preferences.cursor],
    ['data-a11y-images', preferences.images === 'hide' ? 'hide' : null],
    ['data-a11y-colors', preferences.colors === 'invert' ? 'invert' : null],
    ['data-a11y-sound', preferences.sound === 'off' ? 'off' : null],
    ['data-a11y-click', preferences.clickSpeak === 'on' ? 'on' : null],
    ['data-a11y-guide-bar', preferences.guideBar === 'on' ? 'on' : null],
    ['data-a11y-guide-mask', preferences.guideMask === 'on' ? 'on' : null],
  ];
}

export function applyAccessibilityPreferences(root: HTMLElement, preferences: AccessibilityPreferences): void {
  for (const [name, value] of accessibilityAttributes(preferences)) {
    if (value) root.setAttribute(name, value);
    else root.removeAttribute(name);
  }
}

export const ACCESSIBILITY_BOOT_SCRIPT = `(function(){try{var raw=localStorage.getItem(${JSON.stringify(ACCESSIBILITY_STORAGE_KEY)});if(!raw)return;var data=JSON.parse(raw);if(!data||typeof data!=="object")return;var root=document.documentElement;var text={"85":"85","100":"100","125":"125","150":"150"};if(text[data.text]&&data.text!=="100")root.setAttribute("data-a11y-text",text[data.text]);var letters=data.letters==="wide"||(data.letters==null&&data.spacing==="wide");var lines=data.lines==="wide"||(data.lines==null&&data.spacing==="wide");if(letters)root.setAttribute("data-a11y-letters","wide");if(lines)root.setAttribute("data-a11y-lines","wide");if(data.font==="readable"||data.font==="dyslexia")root.setAttribute("data-a11y-font",data.font);if(data.contrast==="high"||data.contrast==="off")root.setAttribute("data-a11y-contrast",data.contrast);if(data.links==="on")root.setAttribute("data-a11y-links","on");if(data.motion==="reduce")root.setAttribute("data-a11y-motion","reduce");if(data.focus==="strong")root.setAttribute("data-a11y-focus","strong");if(data.targets==="large")root.setAttribute("data-a11y-targets","large");if(data.reading==="on")root.setAttribute("data-a11y-reading","on");if(data.cursor==="large"||data.cursor==="bold")root.setAttribute("data-a11y-cursor",data.cursor);if(data.images==="hide")root.setAttribute("data-a11y-images","hide");if(data.colors==="invert")root.setAttribute("data-a11y-colors","invert");if(data.sound==="off")root.setAttribute("data-a11y-sound","off");if(data.clickSpeak==="on")root.setAttribute("data-a11y-click","on");if(data.guideBar==="on")root.setAttribute("data-a11y-guide-bar","on");if(data.guideMask==="on")root.setAttribute("data-a11y-guide-mask","on");}catch(e){}})();`;

export function accessibilityAttributeNames(): readonly string[] {
  return ATTRIBUTE_NAMES;
}
