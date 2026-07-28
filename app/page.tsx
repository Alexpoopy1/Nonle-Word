import englishWords from "an-array-of-english-words";
import NonaGame from "./NonaGame";

const fourLetterWords = englishWords.filter((word) => /^[a-z]{4}$/.test(word));

export default function Home() {
  return <NonaGame dictionary={fourLetterWords} />;
}
