export default `abstract class Animal {
  String speak();
}

class Point {
  const Point();
  Point.named();
  factory Point.origin() => const Point();

  int get x => 0;
  set x(int value) {}

  Point operator +(Point other) => this;
}

mixin Runner {
  void run() {
    print("running");
  }
}

enum Status {
  ready,
  running;

  const Status();
}

class Dog extends Animal with Runner {
  final String name;

  Dog(this.name);

  @override
  String speak() {
    return "\$name barks";
  }
}

extension StringTools on String {
  String doubled() {
    return this + this;
  }
}

extension type UserId(int value) {
  UserId.zero() : value = 0;
}

typedef Operation = int Function(int left, int right);

int get answer => 42;
set answer(int value) {}

int add(int left, int right) {
  return left + right;
}
`
