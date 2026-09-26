/** @param {import('cyclewire').Context<{ id: number }>} context */
export function run({ props }) {
    return props.id;
}
