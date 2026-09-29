import { kindOf, LIMITS, MODULE_ID, readConfig, type Kind } from "./core/door.js";

/**
 * The solid-door settings in Foundry's wall sheet. A door animated with Foundry's swing, swivel or slide is solid, so
 * the section shows for those, after Foundry's door animation settings: which way and whether it is a double door come
 * from Foundry's own Open Direction and Double Door. The section adds how far the door opens at most; that replaces
 * Foundry's Strength, which is hidden while the door is solid. The input is named after the flag, so the sheet's own
 * form saves it with the rest of the wall.
 */

const L = (key: string) => game.i18n.localize(`BEAVERS_SOLID_DOORS.config.${key}`);
const MAX_FIELD = `flags.${MODULE_ID}.max`;

function fieldsHtml(rootId: string, kind: Kind, max: number): string {
  const limits = LIMITS[kind];
  const id = `${rootId}-${MODULE_ID}-max`;
  return `
    <legend>${L("legend")}</legend>
    <p class="hint">${L(`${kind}.hint`)}</p>
    <div class="form-group">
      <label for="${id}">${L(`${kind}.max`)}</label>
      <div class="form-fields">
        <range-picker id="${id}" name="${MAX_FIELD}" value="${max}" min="${limits.min}" max="${limits.max}"
          step="${limits.step}" data-dtype="Number"></range-picker>
      </div>
      <p class="hint">${L(`${kind}.maxHint`)}</p>
    </div>`;
}

const input = (form: HTMLFormElement, name: string) => form.elements.namedItem(name) as HTMLInputElement | null;

function onRender(app: any, element: HTMLElement) {
  const wall = app.document;
  const form: HTMLFormElement | undefined = app.form;
  if (!wall || !form || element.querySelector("fieldset.beavers-solid-doors")) return;
  const el = document.createElement("fieldset");
  el.classList.add("beavers-solid-doors");
  const anchor = element.querySelector("fieldset.door-animation") ?? input(form, "door")?.closest("fieldset");
  if (anchor) anchor.after(el);
  else (element.querySelector(".standard-form") ?? form).append(el);

  let shown: Kind | undefined;
  const refresh = () => {
    const isDoor = Number(input(form, "door")?.value) === CONST.WALL_DOOR_TYPES.DOOR; // no secret doors
    const kind = isDoor ? kindOf(input(form, "animation.type")?.value) : undefined;
    el.hidden = !kind;
    const strength = input(form, "animation.strength")?.closest<HTMLElement>(".form-group");
    if (strength) strength.hidden = !!kind;
    if (kind && kind !== shown) {
      // The value typed so far, or the stored one; readConfig fits it to the kind (or derives it from Strength)
      const typed = shown ? Number((el.querySelector(`[name="${MAX_FIELD}"]`) as any)?.value) : undefined;
      const flags = typed !== undefined ? { max: typed } : wall.flags?.[MODULE_ID];
      const strengthValue = Number(input(form, "animation.strength")?.value);
      const { max } = readConfig(flags, kind, { strength: Number.isFinite(strengthValue) ? strengthValue : undefined });
      el.innerHTML = fieldsHtml(app.id, kind, max);
      shown = kind;
    }
    app.setPosition();
  };
  form.addEventListener("change", (event) => {
    const name = (event.target as HTMLInputElement | null)?.name;
    if (name === "door" || name === "animation.type") refresh();
  });
  refresh();
}

export function registerWallConfig() {
  Hooks.on("renderWallConfig", onRender);
}
