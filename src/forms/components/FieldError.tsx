interface FieldErrorProps {
  id?: string | undefined;
  className: string;
  message?: string | null | undefined;
}

const FieldError = ({ id, className, message }: FieldErrorProps) => {
  if (!message) {
    return null;
  }

  return (
    <p id={id} className={className} data-slot="field.error">
      {message}
    </p>
  );
};

export default FieldError;
