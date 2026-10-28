/** Selection epochs also invalidate refreshes started by a chart that has since closed. */
export class PatientRequests {
  private epoch = 0;
  private refreshNumber = 0;
  private id: string | null = null;
  select(id: string | null) {
    this.id = id;
    this.refreshNumber++;
    const epoch = ++this.epoch;
    return () => epoch === this.epoch;
  }
  refresh(id: string) {
    const epoch = this.epoch;
    const number = ++this.refreshNumber;
    return () => this.id === id && epoch === this.epoch && number === this.refreshNumber;
  }
}
