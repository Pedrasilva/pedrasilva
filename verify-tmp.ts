import { reprocessQueueItem } from "./src/lib/finance/doc-intake.server";
const ids = ["bfeeae85-9ef1-46b1-8414-92d54160d2bf","c286b4aa-621f-45d7-bbd5-68bc3e2b906e","9d2e7a42-7fb6-46a3-b74d-c2141cac4142","e151555b-4943-4413-85c5-d265499455e4","887306c1-31e9-4b6c-8ac7-d22a3b8738b5","d7924f3c-244f-4fc9-88c4-9813ed0340e8"];
for (const id of ids) console.log(id, JSON.stringify(await reprocessQueueItem(id)));
