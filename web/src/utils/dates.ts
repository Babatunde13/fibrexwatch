export const dateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export const currentMonth = dateValue(new Date()).slice(0, 7)

export const monthRange = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number)
  return {
    from: `${month}-01`,
    to: `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, '0')}`,
  }
}

export const initialMonthRange = monthRange(currentMonth)
