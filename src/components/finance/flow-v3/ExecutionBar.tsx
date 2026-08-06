/**
 * Barra de 2,5 px al pie de la celda: % ejecutado (verde) o exceso (ámbar).
 */
import { EXEC_BAR, EXEC_BAR_FILL, EXEC_BAR_OVER, EXEC_BAR_WITH_NOTE } from "./grid-classes";

export function ExecutionBar(props: {
  pctWidth: number;
  over: boolean;
  hasNote: boolean;
  title: string;
}) {
  const track = props.hasNote ? EXEC_BAR_WITH_NOTE : EXEC_BAR;
  const fill = props.over ? EXEC_BAR_OVER : EXEC_BAR_FILL;
  const width = props.over ? 100 : Math.min(100, Math.max(0, props.pctWidth));
  return (
    <span className={track} title={props.title} aria-hidden>
      <span className={fill} style={{ width: `${width}%` }} />
    </span>
  );
}
