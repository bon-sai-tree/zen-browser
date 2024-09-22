// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
var gZenMarketplaceManager = {
  init() {
    const checkForUpdates = document.getElementById('zenThemeMarketplaceCheckForUpdates');
    if (!checkForUpdates) return; // We havent entered the settings page yet.
    if (this.__hasInitializedEvents) return;
    this._buildThemesList();
    this.__hasInitializedEvents = true;
    Services.prefs.addObserver(this.updatePref, this);
    checkForUpdates.addEventListener('click', (event) => {
      if (event.target === checkForUpdates) {
        event.preventDefault();
        this._checkForThemeUpdates(event);
      }
    });
    document.addEventListener('ZenThemeMarketplace:CheckForUpdatesFinished', (event) => {
      checkForUpdates.disabled = false;
      const updates = event.detail.updates;
      const success = document.getElementById('zenThemeMarketplaceUpdatesSuccess');
      const error = document.getElementById('zenThemeMarketplaceUpdatesFailure');
      if (updates) {
        success.hidden = false;
        error.hidden = true;
      } else {
        success.hidden = true;
        error.hidden = false;
      }
    });
    window.addEventListener('unload', this.uninit.bind(this));
  },

  uninit() {
    Services.prefs.removeObserver(this.updatePref, this);
  },

  async observe() {
    this._themes = null;
    await this._buildThemesList();
  },

  _checkForThemeUpdates(event) {
    // Send a message to the child to check for theme updates.
    event.target.disabled = true;
    // send an event that will be listened by the child process.
    document.dispatchEvent(new CustomEvent('ZenCheckForThemeUpdates'));
  },

  get updatePref() {
    return 'zen.themes.updated-value-observer';
  },

  triggerThemeUpdate() {
    Services.prefs.setBoolPref(this.updatePref, !Services.prefs.getBoolPref(this.updatePref));
  },

  get themesList() {
    return document.getElementById('zenThemeMarketplaceList');
  },

  async removeTheme(themeId) {
    const themePath = ZenThemesCommon.getThemeFolder(themeId);

    console.info(`[ZenThemeMarketplaceParent:settings]: Removing theme ${themePath}`);

    await IOUtils.remove(themePath, { recursive: true, ignoreAbsent: true });

    const themes = await ZenThemesCommon.getThemes();
    delete themes[themeId];
    await IOUtils.writeJSON(ZenThemesCommon.themesDataFile, themes);

    this.triggerThemeUpdate();
  },

  async disableTheme(themeId) {
    const themes = await ZenThemesCommon.getThemes();
    const theme = themes[themeId];

    theme.enabled = false;

    await IOUtils.writeJSON(ZenThemesCommon.themesDataFile, themes);
    this._doNotRebuildThemesList = true;
    this.triggerThemeUpdate();
  },

  async enableTheme(themeId) {
    const themes = await ZenThemesCommon.getThemes();
    const theme = themes[themeId];

    theme.enabled = true;

    await IOUtils.writeJSON(ZenThemesCommon.themesDataFile, themes);
    this._doNotRebuildThemesList = true;
    this.triggerThemeUpdate();
  },

  _triggerBuildUpdateWithoutRebuild() {
    this._doNotRebuildThemesList = true;
    this.triggerThemeUpdate();
  },

  async _buildThemesList() {
    if (!this.themesList) return;
    if (this._doNotRebuildThemesList) {
      this._doNotRebuildThemesList = false;
      return;
    }

    console.log('[ZenThemeMarketplaceParent:settings]: Building themes list');

    const themes = await ZenThemesCommon.getThemes();

    const browser = ZenThemesCommon.currentBrowser;

    const themeList = document.createElement('div');

    for (const theme of Object.values(themes)) {
      const sanitizedName = `theme-${theme.name?.replaceAll(/\s/g, '-')?.replaceAll(/[^A-z_-]+/g, '')}`;
      const isThemeEnabled = theme.enabled === undefined || theme.enabled;

      const fragment = window.MozXULElement.parseXULToFragment(`
        <vbox class="zenThemeMarketplaceItem">
          <vbox class="zenThemeMarketplaceItemContent">
            <hbox flex="1" id="zenThemeMarketplaceItemContentHeader">
              <label><h3 class="zenThemeMarketplaceItemTitle"></h3></label>
            </hbox>
            <description class="description-deemphasized zenThemeMarketplaceItemDescription"></description>
          </vbox>
          <hbox class="zenThemeMarketplaceItemActions">
            ${theme.preferences ? `<button id="zenThemeMarketplaceItemConfigureButton-${sanitizedName}" class="zenThemeMarketplaceItemConfigureButton" hidden="true"></button>` : ''}
            <button class="zenThemeMarketplaceItemUninstallButton" data-l10n-id="zen-theme-marketplace-remove-button" zen-theme-id="${theme.id}"></button>
          </hbox>
        </vbox>
      `);

      const themeName = `${theme.name} (v${theme.version || '1.0.0'})`;

      const base = fragment.querySelector('.zenThemeMarketplaceItem');
      const baseHeader = fragment.querySelector('#zenThemeMarketplaceItemContentHeader');

      const dialog = document.createElement('dialog');
      const mainDialogDiv = document.createElement('div');
      const headerDiv = document.createElement('div');
      const headerTitle = document.createElement('h3');
      const closeButton = document.createElement('button');
      const contentDiv = document.createElement('div');
      const mozToggle = document.createElement('moz-toggle');

      mainDialogDiv.className = 'zenThemeMarketplaceItemPreferenceDialog';
      headerDiv.className = 'zenThemeMarketplaceItemPreferenceDialogTopBar';
      headerTitle.textContent = themeName;
      browser.document.l10n.setAttributes(headerTitle, 'zen-theme-marketplace-theme-header-title', {
        name: sanitizedName,
      });
      headerTitle.className = 'zenThemeMarketplaceItemTitle';
      closeButton.id = `${sanitizedName}-modal-close`;
      browser.document.l10n.setAttributes(closeButton, 'zen-theme-marketplace-close-modal');
      contentDiv.id = `${sanitizedName}-preferences-content`;
      contentDiv.className = 'zenThemeMarketplaceItemPreferenceDialogContent';
      mozToggle.className = 'zenThemeMarketplaceItemPreferenceToggle';

      mozToggle.pressed = isThemeEnabled;
      browser.document.l10n.setAttributes(
        mozToggle,
        `zen-theme-marketplace-toggle-${isThemeEnabled ? 'enabled' : 'disabled'}-button`
      );

      baseHeader.appendChild(mozToggle);

      headerDiv.appendChild(headerTitle);
      headerDiv.appendChild(closeButton);

      mainDialogDiv.appendChild(headerDiv);
      mainDialogDiv.appendChild(contentDiv);
      dialog.appendChild(mainDialogDiv);
      base.appendChild(dialog);

      closeButton.addEventListener('click', () => {
        dialog.close();
      });

      mozToggle.addEventListener('toggle', async (event) => {
        const themeId = event.target
          .closest('.zenThemeMarketplaceItem')
          .querySelector('.zenThemeMarketplaceItemUninstallButton')
          .getAttribute('zen-theme-id');

        if (!event.target.hasAttribute('pressed')) {
          await this.disableTheme(themeId);

          browser.document.l10n.setAttributes(mozToggle, 'zen-theme-marketplace-toggle-disabled-button');

          if (theme.preferences) {
            document.getElementById(`zenThemeMarketplaceItemConfigureButton-${sanitizedName}`).setAttribute('hidden', true);
          }
        } else {
          await this.enableTheme(themeId);

          browser.document.l10n.setAttributes(mozToggle, 'zen-theme-marketplace-toggle-enabled-button');

          if (theme.preferences) {
            document.getElementById(`zenThemeMarketplaceItemConfigureButton-${sanitizedName}`).removeAttribute('hidden');
          }
        }
      });

      fragment.querySelector('.zenThemeMarketplaceItemTitle').textContent = themeName;
      fragment.querySelector('.zenThemeMarketplaceItemDescription').textContent = theme.description;
      fragment.querySelector('.zenThemeMarketplaceItemUninstallButton').addEventListener('click', async (event) => {
        const [msg] = await document.l10n.formatValues([{ id: 'zen-theme-marketplace-remove-confirmation' }]);

        if (!confirm(msg)) {
          return;
        }

        await this.removeTheme(event.target.getAttribute('zen-theme-id'));
      });

      if (theme.preferences) {
        fragment.querySelector('.zenThemeMarketplaceItemConfigureButton').addEventListener('click', () => {
          dialog.showModal();
        });

        if (isThemeEnabled) {
          fragment.querySelector('.zenThemeMarketplaceItemConfigureButton').removeAttribute('hidden');
        }
      }

      const preferences = await ZenThemesCommon.getThemePreferences(theme);

      if (preferences.length > 0) {
        const preferencesWrapper = document.createXULElement('vbox');

        preferencesWrapper.setAttribute('flex', '1');

        for (const entry of preferences) {
          const { property, label, type, placeholder } = entry;

          switch (type) {
            case 'dropdown': {
              const { options } = entry;

              const container = document.createXULElement('hbox');
              container.classList.add('zenThemeMarketplaceItemPreference');
              container.setAttribute('align', 'center');
              container.setAttribute('role', 'group');

              const menulist = document.createXULElement('menulist');
              const menupopup = document.createXULElement('menupopup');

              menulist.setAttribute('sizetopopup', 'none');
              menulist.setAttribute('id', property + '-popup-menulist');

              const savedValue = Services.prefs.getStringPref(property, 'none');

              menulist.setAttribute('value', savedValue);
              menulist.setAttribute('tooltiptext', property);

              const defaultItem = document.createXULElement('menuitem');

              defaultItem.setAttribute('value', 'none');

              if (placeholder) {
                defaultItem.setAttribute('label', placeholder || '-');
              } else {
                browser.document.l10n.setAttributes(defaultItem, 'zen-theme-marketplace-dropdown-default-label');
              }

              menupopup.appendChild(defaultItem);

              for (const option of options) {
                const { label, value } = option;

                const valueType = typeof value;

                if (!['string', 'number'].includes(valueType)) {
                  console.log(
                    `[ZenThemeMarketplaceParent:settings]: Warning, invalid data type received (${valueType}), skipping.`
                  );
                  continue;
                }

                const menuitem = document.createXULElement('menuitem');

                menuitem.setAttribute('value', value.toString());
                menuitem.setAttribute('label', label);

                menupopup.appendChild(menuitem);
              }

              menulist.appendChild(menupopup);

              menulist.addEventListener('command', () => {
                const value = menulist.selectedItem.value;

                let element = browser.document.getElementById(sanitizedName);

                if (!element) {
                  element = browser.document.createElement('div');

                  element.style.display = 'none';
                  element.setAttribute('id', sanitizedName);

                  browser.document.body.appendChild(element);
                }

                element.setAttribute(property?.replaceAll(/\./g, '-'), value);

                Services.prefs.setStringPref(property, value === 'none' ? '' : value);
                this._triggerBuildUpdateWithoutRebuild();
              });

              const nameLabel = document.createXULElement('label');
              nameLabel.setAttribute('flex', '1');
              nameLabel.setAttribute('class', 'zenThemeMarketplaceItemPreferenceLabel');
              nameLabel.setAttribute('value', label);
              nameLabel.setAttribute('tooltiptext', property);

              container.appendChild(nameLabel);
              container.appendChild(menulist);
              container.setAttribute('aria-labelledby', label);

              preferencesWrapper.appendChild(container);
              break;
            }

            case 'checkbox': {
              const checkbox = window.MozXULElement.parseXULToFragment(`
                <hbox class="zenThemeMarketplaceItemPreference">
                  <checkbox class="zenThemeMarketplaceItemPreferenceCheckbox" label="${label}" tooltiptext="${property}" zen-pref="${property}"></checkbox>
                </hbox>
              `);

              // Checkbox only works with "true" and "false" values, it's not like HTML checkboxes.
              if (Services.prefs.getBoolPref(property, false)) {
                checkbox.querySelector('.zenThemeMarketplaceItemPreferenceCheckbox').setAttribute('checked', 'true');
              }

              checkbox.querySelector('.zenThemeMarketplaceItemPreferenceCheckbox').addEventListener('click', (event) => {
                const target = event.target.closest('.zenThemeMarketplaceItemPreferenceCheckbox');
                const key = target.getAttribute('zen-pref');
                const checked = target.hasAttribute('checked');

                if (!checked) {
                  target.removeAttribute('checked');
                } else {
                  target.setAttribute('checked', 'true');
                }

                Services.prefs.setBoolPref(key, !checked);
              });

              preferencesWrapper.appendChild(checkbox);
              break;
            }

            case 'string': {
              const container = document.createXULElement('hbox');
              container.classList.add('zenThemeMarketplaceItemPreference');
              container.setAttribute('align', 'center');
              container.setAttribute('role', 'group');

              const savedValue = Services.prefs.getStringPref(property, '');
              const sanitizedProperty = property?.replaceAll(/\./g, '-');

              const input = document.createElement('input');
              input.setAttribute('flex', '1');
              input.setAttribute('type', 'text');
              input.id = `${sanitizedProperty}-input`;
              input.value = savedValue;

              if (placeholder) {
                input.setAttribute('placeholder', placeholder || '-');
              } else {
                browser.document.l10n.setAttributes(input, 'zen-theme-marketplace-input-default-placeholder');
              }

              input.addEventListener(
                'input',
                ZenThemesCommon.throttle((event) => {
                  const value = event.target.value;

                  Services.prefs.setStringPref(property, value);
                  this._triggerBuildUpdateWithoutRebuild();

                  if (value === '') {
                    browser.document.querySelector(':root').style.removeProperty(`--${sanitizedProperty}`);
                  } else {
                    browser.document.querySelector(':root').style.setProperty(`--${sanitizedProperty}`, value);
                  }
                }, 500)
              );

              const nameLabel = document.createXULElement('label');
              nameLabel.setAttribute('flex', '1');
              nameLabel.setAttribute('class', 'zenThemeMarketplaceItemPreferenceLabel');
              nameLabel.setAttribute('value', label);
              nameLabel.setAttribute('tooltiptext', property);

              container.appendChild(nameLabel);
              container.appendChild(input);
              container.setAttribute('aria-labelledby', label);

              preferencesWrapper.appendChild(container);
              break;
            }

            default:
              console.log(
                `[ZenThemeMarketplaceParent:settings]: Warning, unknown preference type received (${type}), skipping.`
              );
              continue;
          }
        }
        contentDiv.appendChild(preferencesWrapper);
      }
      themeList.appendChild(fragment);
    }

    this.themesList.replaceChildren(...themeList.children);
    themeList.remove();
  },
};

var gZenLooksAndFeel = {
  init() {
    if (this.__hasInitialized) return;
    this.__hasInitialized = true;
    this._initializeColorPicker(this._getInitialAccentColor());
    window.zenPageAccentColorChanged = this._handleAccentColorChange.bind(this);
    this._initializeTabbarExpandForm();
    gZenThemeBuilder.init();
    gZenMarketplaceManager.init();
    var onPreferColorSchemeChange = this.onPreferColorSchemeChange.bind(this);
    window.matchMedia('(prefers-color-scheme: dark)').addListener(onPreferColorSchemeChange);
    this.onPreferColorSchemeChange();
    window.addEventListener('unload', () => {
      window.matchMedia('(prefers-color-scheme: dark)').removeListener(onPreferColorSchemeChange);
    });
    setTimeout(() => {
      const group = document.getElementById('zenLooksAndFeelGroup');
      const webGroup = document.getElementById('webAppearanceGroup');
      webGroup.style.display = 'none';
      // Iterate reverse to prepend the elements in the correct order.
      for (let child of [...webGroup.children].reverse()) {
        group.prepend(child);
      }
    }, 500);
    this.setDarkThemeListener();
    this.setCompactModeStyle();
  },

  onPreferColorSchemeChange(event) {
    const darkTheme = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let elem = document.getElementById('ZenDarkThemeStyles');
    if (darkTheme) {
      elem.removeAttribute('hidden');
    } else {
      elem.setAttribute('hidden', 'true');
    }
  },

  setDarkThemeListener() {
    const chooser = document.getElementById('zen-dark-theme-styles-form');
    const radios = [...chooser.querySelectorAll('input')];
    for (let radio of radios) {
      if (radio.value === 'amoled' && Services.prefs.getBoolPref('zen.theme.color-prefs.amoled')) {
        radio.checked = true;
      } else if (radio.value === 'colorful' && Services.prefs.getBoolPref('zen.theme.color-prefs.colorful')) {
        radio.checked = true;
      } else if (
        radio.value === 'default' &&
        !Services.prefs.getBoolPref('zen.theme.color-prefs.amoled') &&
        !Services.prefs.getBoolPref('zen.theme.color-prefs.colorful')
      ) {
        radio.checked = true;
      }
      radio.addEventListener('change', (e) => {
        let value = e.target.value;
        switch (value) {
          case 'amoled':
            Services.prefs.setBoolPref('zen.theme.color-prefs.amoled', true);
            Services.prefs.setBoolPref('zen.theme.color-prefs.colorful', false);
            break;
          case 'colorful':
            Services.prefs.setBoolPref('zen.theme.color-prefs.amoled', false);
            Services.prefs.setBoolPref('zen.theme.color-prefs.colorful', true);
            break;
          default:
            Services.prefs.setBoolPref('zen.theme.color-prefs.amoled', false);
            Services.prefs.setBoolPref('zen.theme.color-prefs.colorful', false);
            break;
        }
      });
    }
  },

  setCompactModeStyle() {
    const chooser = document.getElementById('zen-compact-mode-styles-form');
    const radios = [...chooser.querySelectorAll('input')];
    for (let radio of radios) {
      if (radio.value === 'left' && Services.prefs.getBoolPref('zen.view.compact.hide-tabbar')) {
        radio.checked = true;
      } else if (radio.value === 'top' && Services.prefs.getBoolPref('zen.view.compact.hide-toolbar')) {
        radio.checked = true;
      } else if (
        radio.value === 'both' &&
        !Services.prefs.getBoolPref('zen.view.compact.hide-tabbar') &&
        !Services.prefs.getBoolPref('zen.view.compact.hide-toolbar')
      ) {
        radio.checked = true;
      }
      radio.addEventListener('change', (e) => {
        let value = e.target.value;
        switch (value) {
          case 'left':
            Services.prefs.setBoolPref('zen.view.compact.hide-tabbar', true);
            Services.prefs.setBoolPref('zen.view.compact.hide-toolbar', false);
            break;
          case 'top':
            Services.prefs.setBoolPref('zen.view.compact.hide-tabbar', false);
            Services.prefs.setBoolPref('zen.view.compact.hide-toolbar', true);
            break;
          default:
            Services.prefs.setBoolPref('zen.view.compact.hide-tabbar', true);
            Services.prefs.setBoolPref('zen.view.compact.hide-toolbar', true);
            break;
        }
      });
    }
  },

  _initializeTabbarExpandForm() {
    const form = document.getElementById('zen-expand-tabbar-strat');
    const radios = form.querySelectorAll('input[type=radio]');
    const onHoverPref = 'zen.view.sidebar-expanded.on-hover';
    const defaultExpandPref = 'zen.view.sidebar-expanded';
    if (Services.prefs.getBoolPref(onHoverPref)) {
      form.querySelector('input[value="hover"]').checked = true;
    } else if (Services.prefs.getBoolPref(defaultExpandPref)) {
      form.querySelector('input[value="expand"]').checked = true;
    } else {
      form.querySelector('input[value="none"]').checked = true;
    }
    for (let radio of radios) {
      radio.addEventListener('change', (e) => {
        switch (e.target.value) {
          case 'expand':
            Services.prefs.setBoolPref(onHoverPref, false);
            Services.prefs.setBoolPref(defaultExpandPref, true);
            break;
          case 'none':
            Services.prefs.setBoolPref(onHoverPref, false);
            Services.prefs.setBoolPref(defaultExpandPref, false);
            break;
          case 'hover':
            Services.prefs.setBoolPref(onHoverPref, true);
            Services.prefs.setBoolPref(defaultExpandPref, true);
            break;
        }
      });
    }
  },

  _initializeColorPicker(accentColor) {
    let elem = document.getElementById('zenLooksAndFeelColorOptions');
    elem.innerHTML = '';
    for (let color of ZenThemesCommon.kZenColors) {
      let colorElemParen = document.createElement('div');
      let colorElem = document.createElement('div');
      colorElemParen.classList.add('zenLooksAndFeelColorOptionParen');
      colorElem.classList.add('zenLooksAndFeelColorOption');
      colorElem.style.setProperty('--zen-primary-color', color, 'important');
      if (accentColor === color) {
        colorElemParen.setAttribute('selected', 'true');
      }
      colorElemParen.addEventListener('click', () => {
        Services.prefs.setStringPref('zen.theme.accent-color', color);
      });
      colorElemParen.appendChild(colorElem);
      elem.appendChild(colorElemParen);
    }
    // TODO: add custom color selection!
  },

  _handleAccentColorChange(accentColor) {
    this._initializeColorPicker(accentColor);
  },

  _getInitialAccentColor() {
    return Services.prefs.getStringPref('zen.theme.accent-color', ZenThemesCommon.kZenColors[0]);
  },
};

var gZenWorkspacesSettings = {
  init() {
    Services.prefs.addObserver('zen.workspaces.enabled', this);
    window.addEventListener('unload', () => {
      Services.prefs.removeObserver('zen.workspaces.enabled', this);
    });
  },

  async observe(subject, topic, data) {
    await this.onWorkspaceChange(Services.prefs.getBoolPref('zen.workspaces.enabled'));
  },

  async onWorkspaceChange(checked) {
    if (checked) {
      let buttonIndex = await confirmRestartPrompt(true, 1, true, false);
      if (buttonIndex == CONFIRM_RESTART_PROMPT_RESTART_NOW) {
        Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart);
        return;
      }
    }
  },
};

const ZEN_CKS_CLASS_BASE = 'zenCKSOption';
const ZEN_CKS_INPUT_FIELD_CLASS = `${ZEN_CKS_CLASS_BASE}-input`;
const ZEN_CKS_LABEL_CLASS = `${ZEN_CKS_CLASS_BASE}-label`;
const ZEN_CKS_WRAPPER_ID = `${ZEN_CKS_CLASS_BASE}-wrapper`;
const ZEN_CKS_GROUP_PREFIX = `${ZEN_CKS_CLASS_BASE}-group`;
const KEYBIND_ATTRIBUTE_KEY = 'key';

var gZenCKSSettings = {
  init() {
    this._currentAction = null;
    this._initializeEvents();
    this._initializeCKS();
  },

  _initializeEvents() {
    window.addEventListener('keydown', this._handleKeyDown.bind(this));
  },

  _initializeCKS() {
    let wrapper = document.getElementById(ZEN_CKS_WRAPPER_ID);

    let shortcuts = gZenKeyboardShortcutsManager.getModifiableShortcuts();

    if (!shortcuts) {
      throw Error('No shortcuts defined!');
    }

    // Generate section per each group
    for (let group of VALID_SHORTCUT_GROUPS) {
      let groupClass = `${ZEN_CKS_GROUP_PREFIX}-${group}`;
      if (!wrapper.querySelector(`[data-group="${groupClass}"]`)) {
        let groupElem = document.createElement('h2');
        groupElem.setAttribute('data-group', groupClass);
        document.l10n.setAttributes(groupElem, `groupClass`);
        wrapper.appendChild(groupElem);
      }
    }

    for (let shortcut of shortcuts) {
      const keyID = shortcut.getID();
      const action = shortcut.getAction();
      const l10nID = shortcut.getL10NID();
      const group = shortcut.getGroup();
      const keyInString = shortcut.toUserString();
      console.debug(keyInString);

      // const labelValue = l10nID == null ? keyID : l10nID;
      const labelValue = keyID;

      let fragment = window.MozXULElement.parseXULToFragment(`
        <hbox class="${ZEN_CKS_CLASS_BASE}">
          <label class="${ZEN_CKS_LABEL_CLASS}" for="${ZEN_CKS_CLASS_BASE}-${action}">${labelValue}</label>
          <html:input readonly="1" class="${ZEN_CKS_INPUT_FIELD_CLASS}" id="${ZEN_CKS_INPUT_FIELD_CLASS}-${action}" />
        </hbox>
      `);

      document.l10n.setAttributes(fragment.querySelector(`.${ZEN_CKS_LABEL_CLASS}`), labelValue);

      let input = fragment.querySelector(`.${ZEN_CKS_INPUT_FIELD_CLASS}`);
      if (keyInString) {
        input.value = keyInString;
      } else {
        this._resetShortcut(input);
      }

      input.setAttribute(KEYBIND_ATTRIBUTE_KEY, action);

      input.addEventListener('focus', (event) => {
        const value = event.target.getAttribute(KEYBIND_ATTRIBUTE_KEY);
        this._currentAction = value;
        event.target.classList.add(`${ZEN_CKS_INPUT_FIELD_CLASS}-editing`);
      });

      input.addEventListener('editDone', (event) => {
        const target = event.target;
        target.classList.add(`${ZEN_CKS_INPUT_FIELD_CLASS}-editing`);
        this._editDone(target);
      });

      const groupElem = wrapper.querySelector(`[data-group="${ZEN_CKS_GROUP_PREFIX}-${group}"]`);
      groupElem.after(fragment);
    }
  },

  _resetShortcut(input) {
    input.value = 'Not set';
    input.classList.remove(`${ZEN_CKS_INPUT_FIELD_CLASS}-invalid`);
    input.classList.remove(`${ZEN_CKS_INPUT_FIELD_CLASS}-editing`);
    input.classList.add(`${ZEN_CKS_INPUT_FIELD_CLASS}-not-set`);

    if (this._currentAction) {
      this._editDone();
      gZenKeyboardShortcutsManager.setShortcut(this._currentAction, null, null);
    }
  },

  _editDone(shortcut, modifiers) {
    gZenKeyboardShortcutsManager.setShortcut(this._currentAction, shortcut, modifiers);
    this._currentAction = null;
  },

  //TODO Check for duplicates
  _handleKeyDown(event) {
    event.preventDefault();

    if (!this._currentAction) {
      return;
    }

    let input = document.querySelector(`.${ZEN_CKS_INPUT_FIELD_CLASS}[${KEYBIND_ATTRIBUTE_KEY}="${this._currentAction}"]`);
    const modifiers = new KeyShortcutModifiers(event.ctrlKey, event.altKey, event.shiftKey, event.metaKey);
    const modifiersActive = modifiers.areAnyActive();

    let shortcut = event.key;

    shortcut = shortcut.replace(/Ctrl|Control|Shift|Alt|Option|Cmd|Meta/, ''); // Remove all modifiers

    if (shortcut == 'Tab' && !modifiersActive) {
      input.classList.remove(`${ZEN_CKS_INPUT_FIELD_CLASS}-editing`);
      this._latestValidKey = null;
      return;
    } else if (shortcut == 'Escape' && !modifiersActive) {
      input.classList.remove(`${ZEN_CKS_INPUT_FIELD_CLASS}-editing`);

      if (!this._latestValidKey) {
        if (!input.classList.contains(`${ZEN_CKS_INPUT_FIELD_CLASS}-invalid`)) {
          input.classList.add(`${ZEN_CKS_INPUT_FIELD_CLASS}-invalid`);
        }
      } else {
        this._editDone(input, this._latestValidKey, modifiers);
        this._latestValidKey = null;
      }
      return;
    } else if (shortcut == 'Backspace' && !modifiersActive) {
      this._resetShortcut(input);
      this._latestValidKey = null;
      return;
    }

    input.classList.remove(`${ZEN_CKS_INPUT_FIELD_CLASS}-invalid`);
    input.value = modifiers.toUserString() + shortcut;
    this._latestValidKey = shortcut;
  },
};

Preferences.addAll([
  {
    id: 'zen.theme.toolbar-themed',
    type: 'bool',
    default: true,
  },
  {
    id: 'zen.sidebar.enabled',
    type: 'bool',
    default: true,
  },
  {
    id: 'zen.sidebar.close-on-blur',
    type: 'bool',
    default: true,
  },
  {
    id: 'zen.view.compact',
    type: 'bool',
    default: false,
  },
  {
    id: 'zen.view.compact.hide-toolbar',
    type: 'bool',
    default: false,
  },
  {
    id: 'zen.view.compact.toolbar-flash-popup',
    type: 'bool',
    default: true,
  },
  {
    id: 'zen.workspaces.enabled',
    type: 'bool',
    default: true,
  },
  {
    id: 'zen.view.sidebar-expanded.show-button',
    type: 'bool',
    default: true,
  },
  {
    id: 'zen.view.sidebar-expanded',
    type: 'bool',
    default: true,
  },
  {
    id: 'zen.theme.pill-button',
    type: 'bool',
    default: true,
  },
  {
    id: 'zen.workspaces.hide-default-container-indicator',
    type: 'bool',
    default: true,
  },
  {
    id: 'zen.workspaces.individual-pinned-tabs',
    type: 'bool',
    default: true,
  },
  {
    id: 'zen.workspaces.show-icon-strip',
    type: 'bool',
    default: true,
  },
]);
