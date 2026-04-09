interface FieldHelperProps {
  id?: string | undefined;
  className: string;
  text?: string | undefined;
}

const FieldHelper = ({ id, className, text }: FieldHelperProps) => {
  if (!text) {
    return null;
  }

  return (
    <p id={id} className={className} data-slot="field.helper">
      {text}
    </p>
  );
};

export default FieldHelper;
